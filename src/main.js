import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { OBJLoader } from './OBJLoader.js';
import { VelocityField } from './VelocityField.js';
import { ParticleSystem } from './ParticleSystem.js';

class App {
    constructor() {
        const canvas = document.getElementById('webgl-canvas');
        this.sceneManager = new SceneManager(canvas);
        
        this.objLoader = new OBJLoader(this.sceneManager.scene);
        window.objLoader = this.objLoader;
        // Initialize systems
        this.velocityField = new VelocityField(this.sceneManager.scene);
        
        // We need to wait for renderer to be ready before initing particle system?
        // Renderer is ready.
        this.particleSystem = new ParticleSystem(
            this.sceneManager.scene, 
            this.sceneManager.renderer,
            this.velocityField
        );
        
        // Load default object and generate field
        const mesh = this.objLoader.createDefaultSphere();
        this.regenerateField(mesh);
        
        this.lastTime = 0;
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
        
        this.setupUI();
    }
    
    regenerateField(mesh) {
        // Get params from UI
        const resolution = document.getElementById('grid-resolution')?.value || 64;
        const method = document.getElementById('flow-method')?.value || 'potential';
        
        this.velocityField.generate(mesh, {
            resolution: resolution,
            method: method,
            flowParams: {} // TODO: Pass other params
        });
    }
    
    setupUI() {
        const panelToggle = document.getElementById('toggle-panel');
        const panelContent = document.querySelector('.panel-content');
        
        if(panelToggle && panelContent) {
            panelToggle.addEventListener('click', () => {
                if(panelContent.style.display === 'none') {
                    panelContent.style.display = 'block';
                    panelToggle.textContent = '▼';
                } else {
                    panelContent.style.display = 'none';
                    panelToggle.textContent = '▲';
                }
            });
        }
        
        // OBJ Loading
        const fileInput = document.getElementById('obj-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const overlay = document.getElementById('loading-overlay');
                    if (overlay) overlay.classList.add('active');
                    
                    // Small timeout to let UI update
                    setTimeout(() => {
                        this.objLoader.loadFromFile(file)
                            .then((mesh) => {
                                // Regenerate field with new mesh
                                this.regenerateField(mesh);
                                if (overlay) overlay.classList.remove('active');
                            })
                            .catch(err => {
                                console.error(err);
                                if (overlay) overlay.classList.remove('active');
                                alert("Failed to load OBJ");
                            });
                    }, 100);
                }
            });
        }
        
        // Toggles
        document.getElementById('toggle-wireframe')?.addEventListener('change', (e) => {
            this.objLoader.toggleWireframe(e.target.checked);
        });
        
        document.getElementById('toggle-visibility')?.addEventListener('change', (e) => {
            this.objLoader.toggleVisibility(e.target.checked);
        });

        // Velocity Field Params
        const updateField = () => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.add('active');
             setTimeout(() => {
                this.regenerateField(this.objLoader.currentMesh);
                if (overlay) overlay.classList.remove('active');
             }, 50);
        };
        
        document.getElementById('flow-method')?.addEventListener('change', updateField);
        document.getElementById('grid-resolution')?.addEventListener('change', updateField);
        
        // Particle System Params
        // We'll update these every frame or on change. On change is better for some.
        const updateParticles = () => {
            const x = parseFloat(document.getElementById('source-x').value);
            const y = parseFloat(document.getElementById('source-y').value);
            const z = parseFloat(document.getElementById('source-z').value);
            
            const rate = parseInt(document.getElementById('emission-rate').value);
            document.getElementById('emission-rate-val').textContent = rate;
            
            const life = parseInt(document.getElementById('particle-lifespan').value);
            document.getElementById('particle-lifespan-val').textContent = life;
            
            const speed = parseFloat(document.getElementById('speed-multiplier').value);
            document.getElementById('speed-multiplier-val').textContent = speed;
            
            this.particleSystem.updateParams({
                emitterPos: new THREE.Vector3(x, y, z),
                lifespan: life,
                speedMultiplier: speed,
                emissionRate: rate
            });
        };
        
        // Listeners for particle controls
        ['source-x', 'source-y', 'source-z', 'emission-rate', 'particle-lifespan', 'speed-multiplier'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', updateParticles);
        });
        
        // Initial update
        updateParticles();
    }

    animate(time) {
        requestAnimationFrame(this.animate);
        
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.sceneManager.update();
        
        // Update particles
        this.particleSystem.update(time / 1000, deltaTime); // Time in seconds
        
        this.sceneManager.render();
        
        // Update stats
        const fps = 1 / deltaTime;
        const fpsElem = document.getElementById('fps-counter');
        const countElem = document.getElementById('particle-count');
        if (time % 500 < 20) {
             if (fpsElem) fpsElem.textContent = Math.round(fps);
             if (countElem) countElem.textContent = this.particleSystem.COUNT.toLocaleString();
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new App();
});
