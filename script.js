const AudioSystem = (function () {
  let bg = document.querySelector('.audio-system__bg');
  
  function playBg() {
    if (bg && bg.paused) {
      bg.volume = 0.5;
      bg.play().catch(err => console.log(err));
    }
  }
  
  return { playBg };
})();





const UI = {
  app: document.getElementById("app")
};

const SceneManager = {
  scenes: {},
  active: null,
  
  create(scene) {
    if(this.scenes[scene.id]) return this.scenes[scene.id];
  
    const el = document.createElement("div");
    el.className = "scene";
    el.dataset.scene = scene.id;
    el.style.display = "none";
    UI.app.appendChild(el);
    this.scenes[scene.id] = el;
    return el;
  },
  
  show(id) {
    const scene = this.scenes[id];
    if(!scene) throw new Error(`Scene ${id} not found`);
    scene.style.display = "block";
    this.active = scene;
    return scene;
  },
  
  hide(id) {
    const scene = this.scenes[id];
  
    if (scene) {
      scene.style.display = "none";
      scene.style.opacity = 1;
  
      const content = scene.querySelector(".content");
      if (content) content.innerHTML = "";
  
      const button = scene.querySelector("button");
      if (button) button.disabled = true;
    }
  }
};

const LayerRenderer = {
  render(scene) {
    const root = SceneManager.create(scene);

    if(root.dataset.ready)
      return root;

    root.innerHTML = `
      <h2>${scene.title}</h2>
      <div class="content"></div>
      <button>${scene.button.text}</button>
    `;

    root.dataset.ready = true;

    return root;
  }
};

const App = {
  settings:null,
  manifest:null,
  variables:null,

  currentStory:null,
  currentScene:null,
  currentUI:null,

  busy:false
};

const Loader = {
  async json(path) {
    const response = await fetch(path);
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  async bootstrap() {
    App.settings = await this.json("./data/settings.json");
    App.manifest = await this.json("./data/manifest.json");
    App.variables = await this.json("./data/variables.json");
    App.currentStory = App.manifest.story;
  },

  async scene(id) {
    const path = `./data/stories/${App.currentStory}/${id}.json`;
    App.currentScene = await this.json(path);
    return App.currentScene;
  }
};

const Utils = {
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  replaceVariables(text) {
    if (typeof text !== "string") return text;

    return text.replace(/\{\{(.*?)\}\}/g, (_, key) =>
      App.variables[key.trim()] ?? `{{${key}}}`
    );
  },
  
  progress(value, max = 10) {
    const fill = Math.round(value / 100 * max);
    return "█".repeat(fill) + "░".repeat(max - fill);
  }
};

const Animation = {
  async exit(element,type) {
    if(type !== "fade")
      return;
  
    await element.animate(
      [
        {opacity:1},
        {opacity:0}
      ],
      {
        duration:300,
        fill:"forwards"
      }
    ).finished;
  },
  
  async enter(element,type) {
    if(type !== "fade")
      return;
  
    await element.animate(
      [
        {opacity:0},
        {opacity:1}
      ],
      {
        duration:300,
        fill:"forwards"
      }
    ).finished;
  
    element.style.opacity = 1;
  }
};

const Typewriter = {
  async lines(lines, typing) {
    for(const line of lines){
      App.currentUI.content.innerHTML = "";

      const p = document.createElement("p");
      App.currentUI.content.appendChild(p);

      await this.line(p, line, typing);
      await Utils.delay(typing.delay);
    }
  },

  async line(element, text, typing) {
    element.textContent = "";

    for(const char of Utils.replaceVariables(text)){
      element.textContent += char;
      await Utils.delay(typing.speed);
    }
  }
};

const Loading = {
  async play(scene) {
    for(const step of scene.steps){
      App.currentUI.content.innerHTML = "";

      const progress = document.createElement("p");
      progress.textContent = `[${Utils.progress(step.progress)}] ${step.progress}%`;

      const text = document.createElement("p");
      text.textContent = step.text;

      App.currentUI.content.append(progress, text);

      await Utils.delay(scene.typing.delay);
    }
  }
};

const Analysis = {
  async play(scene) {
    for(const item of scene.items){
      App.currentUI.content.innerHTML = "";

      const label = document.createElement("p");
      label.textContent = item.label;

      const progress = document.createElement("p");
      progress.textContent = `[${Utils.progress(item.value)}] ${item.value}%`;

      App.currentUI.content.append(label, progress);

      await Utils.delay(scene.typing.delay);
    }
  }
};

const Renderer = {
  async typing(scene) {
    await Typewriter.lines(scene.content, scene.typing);
  },
  
  async dialog(scene) {
    return this.typing(scene);
  },

  async loading(scene) {
    await Loading.play(scene);
  },

  async analysis(scene) {
    await Analysis.play(scene);
  }
};

const Actions = {
  next() {
    const story = App.manifest.stories[App.currentStory];
    const index = story.indexOf(App.currentScene.id);
    if (index === -1) return;
    const nextScene = story[index + 1];
    if (nextScene) {
      Engine.goto(nextScene);
    }
  },

  restart() {
    const firstScene = App.manifest.stories[App.currentStory][0];
    Engine.goto(firstScene);
  }
};

const Engine = {
  
  async goto(id) {
    if(App.busy) return;
  
    App.busy = true;
  
    try {
      const old = SceneManager.active;
      if(old) {
        await Animation.exit(old, App.currentScene.animation.exit);
        SceneManager.hide(old.dataset.scene);
      }
  
      const scene = await Loader.scene(id);
      const root = LayerRenderer.render(scene);
  
      root.style.display = "block";
      root.style.opacity = 0;
  
      SceneManager.active = root;
  
      App.currentUI = {
        root,
        content: root.querySelector(".content"),
        button: root.querySelector("button")
      };
      
      App.currentUI.button.disabled = true;
      await Animation.enter(root, scene.animation.enter);
      await Renderer[scene.type](scene);
      App.currentUI.button.disabled = false;
  
    } finally {
      App.busy = false;
    }
  },
  
  async init() {
    await Loader.bootstrap();
    this.bindEvents();
  
    const firstScene = App.manifest.stories[App.currentStory][0];
    await this.goto(firstScene);
  },
  
  bindEvents() {
    UI.app.addEventListener("click", e => {
      if(e.target.tagName !== "BUTTON") return;
      const action = Actions[App.currentScene.button.action];
      AudioSystem.playBg();
      action?.();
    });
  }
  
};

window.addEventListener("DOMContentLoaded", () => Engine.init());















const bgContainer = document.getElementById('bgContainer');
function buildMatrixBackground() {
  
  bgContainer.innerHTML = '';
  
  const charWidth = 95; 
  const columnCount = Math.ceil(window.innerWidth / charWidth) + 1;
  
  let textBlock = "";
  
  for (let i = 0; i < 60; i++) {
    textBlock += "I LOVE YOU<br>";
  }
  
  for (let i = 0; i < columnCount; i++) {
    
    const col = document.createElement('div');
    col.className = 'matrix-column';
    
    const moveDiv = document.createElement('div');
    moveDiv.className = 'matrix-move';
    
    moveDiv.innerHTML = textBlock + textBlock;
    
    const fontSize = Math.floor(Math.random() * 1) + 2;
    moveDiv.style.scale = `${fontSize}`;
    
    col.style.opacity = (Math.random() * 0.5 + 0.3).toFixed(2);
    moveDiv.style.animationDelay = (Math.random() * - 100) + 's';
    
    col.appendChild(moveDiv);
    
    bgContainer.appendChild(col);
  }
}
window.addEventListener('resize', buildMatrixBackground);
buildMatrixBackground();