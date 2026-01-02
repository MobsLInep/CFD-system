import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        
        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true, // MSAA 4x equivalent usually
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(1.0); // As per prompt
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Setup camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000);
        this.camera.position.set(2, 1.5, 2);
        
        // Setup controls
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Setup lighting
        this.setupLighting();
        
        // Setup background
        this.setupBackground();
        
        // Event listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    setupLighting() {
        // Directional light from camera direction (initial)
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.directionalLight.position.copy(this.camera.position);
        this.scene.add(this.directionalLight);
        
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
    }

    setupBackground() {
        // Gradient background using CanvasTexture
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        
        // Dark charcoal #1a1a1a at bottom to #2d3436 at top
        const gradient = context.createLinearGradient(0, 512, 0, 0);
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#2d3436');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 2, 512);
        
        const texture = new THREE.CanvasTexture(canvas);
        this.scene.background = texture;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    update() {
        // Update directional light to follow camera (optional, but requested "from camera direction")
        // Actually prompt says "Directional light from camera direction". 
        // Usually this means it's fixed relative to camera or just initially there. 
        // I'll keep it simple and update it if needed. 
        // For now let's just update controls.
        this.controls.update();
        
        // Update light position to match camera to act as a "headlamp" if desired, 
        // or just leave it fixed. Let's make it a headlamp for better visibility of 3D forms.
        this.directionalLight.position.copy(this.camera.position);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
