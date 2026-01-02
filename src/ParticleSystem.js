import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { particleComputeShaderPosition, particleComputeShaderVelocity, particleVertexShader, particleFragmentShader } from './shaders.js';

export class ParticleSystem {
    constructor(scene, renderer, velocityField) {
        this.scene = scene;
        this.renderer = renderer;
        this.velocityField = velocityField; // Reference to VelocityField instance
        
        this.WIDTH = 256; // Texture width
        this.COUNT = this.WIDTH * this.WIDTH; // 65k particles
        
        this.gpuCompute = null;
        this.velocityVariable = null;
        this.positionVariable = null;
        this.positionUniforms = null;
        this.velocityUniforms = null;
        
        this.particles = null;
        
        this.initGPU();
        this.initParticles();
    }

    initGPU() {
        this.gpuCompute = new GPUComputationRenderer(this.WIDTH, this.WIDTH, this.renderer);

        if (this.renderer.capabilities.isWebGL2 === false) {
            this.gpuCompute.setDataType(THREE.HalfFloatType);
        }

        const dtPosition = this.gpuCompute.createTexture();
        const dtVelocity = this.gpuCompute.createTexture();
        
        this.fillTextures(dtPosition, dtVelocity);

        this.positionVariable = this.gpuCompute.addVariable("texturePosition", particleComputeShaderPosition, dtPosition);
        this.velocityVariable = this.gpuCompute.addVariable("textureVelocity", particleComputeShaderVelocity, dtVelocity);

        this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
        this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);

        this.positionUniforms = this.positionVariable.material.uniforms;
        this.velocityUniforms = this.velocityVariable.material.uniforms;

        // Init Uniforms
        this.positionUniforms['time'] = { value: 0.0 };
        this.positionUniforms['delta'] = { value: 0.0 };
        this.positionUniforms['maxAge'] = { value: 300.0 };
        this.positionUniforms['emitterPos'] = { value: new THREE.Vector3(-1, 0, 0) };
        this.positionUniforms['boundsMin'] = { value: new THREE.Vector3(-2, -2, -2) };
        this.positionUniforms['boundsMax'] = { value: new THREE.Vector3(2, 2, 2) };
        this.positionUniforms['speedMultiplier'] = { value: 1.0 };
        this.positionUniforms['emissionShape'] = { value: 0 }; // 0: Point
        this.positionUniforms['emissionRadius'] = { value: 0.2 };

        this.velocityUniforms['time'] = { value: 0.0 };
        this.velocityUniforms['delta'] = { value: 0.0 };
        this.velocityUniforms['gridMin'] = { value: new THREE.Vector3(-1, -1, -1) };
        this.velocityUniforms['gridMax'] = { value: new THREE.Vector3(1, 1, 1) };
        this.velocityUniforms['initialDirection'] = { value: new THREE.Vector3(1, 0, 0) };
        this.velocityUniforms['initialSpeed'] = { value: 1.0 };
        this.velocityUniforms['velocityField'] = { value: null };

        const error = this.gpuCompute.init();
        if (error !== null) {
            console.error(error);
        }
    }

    fillTextures(texturePosition, textureVelocity) {
        const posArray = texturePosition.image.data;
        const velArray = textureVelocity.image.data;

        for (let k = 0, kl = posArray.length; k < kl; k += 4) {
            // Position
            posArray[k + 0] = (Math.random() * 2 - 1);
            posArray[k + 1] = (Math.random() * 2 - 1);
            posArray[k + 2] = (Math.random() * 2 - 1);
            posArray[k + 3] = Math.random() * 300; // Random age

            // Velocity
            velArray[k + 0] = 0;
            velArray[k + 1] = 0;
            velArray[k + 2] = 0;
            velArray[k + 3] = 0;
        }
    }

    initParticles() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.COUNT * 3);
        
        for (let i = 0; i < this.COUNT; i++) {
            const i3 = i * 3;
            const x = (i % this.WIDTH) / this.WIDTH;
            const y = Math.floor(i / this.WIDTH) / this.WIDTH;
            
            positions[i3 + 0] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = 0;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                texturePosition: { value: null },
                textureVelocity: { value: null },
                pointSize: { value: 2.0 }
            },
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.particles = new THREE.Points(geometry, material);
        this.particles.frustumCulled = false;
        this.scene.add(this.particles);
    }

    update(time, deltaTime) {
        if (!this.velocityField.texture) return;

        // Update Uniforms
        this.positionUniforms['time'].value = time;
        this.positionUniforms['delta'].value = deltaTime;
        
        this.velocityUniforms['time'].value = time;
        this.velocityUniforms['delta'].value = deltaTime;
        this.velocityUniforms['velocityField'].value = this.velocityField.texture;

        // Run Compute
        this.gpuCompute.compute();

        // Update Display Material
        this.particles.material.uniforms['texturePosition'].value = this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
        this.particles.material.uniforms['textureVelocity'].value = this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
    }
    
    updateParams(params) {
        if (params.emitterPos) this.positionUniforms['emitterPos'].value.copy(params.emitterPos);
        if (params.lifespan) this.positionUniforms['maxAge'].value = params.lifespan;
        if (params.speedMultiplier) this.positionUniforms['speedMultiplier'].value = params.speedMultiplier;
        if (params.emissionRate) {
             // We can't change texture size easily. 
             // We could use a uniform 'activeCount' to only render a portion?
             // But for now we just use full count.
        }
        
        // Add shape params if passed (not yet connected in main.js, but good to have)
        if (params.emissionShape !== undefined) this.positionUniforms['emissionShape'].value = params.emissionShape;
        if (params.emissionRadius !== undefined) this.positionUniforms['emissionRadius'].value = params.emissionRadius;
    }
}
