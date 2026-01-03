import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { particleComputeShaderPosition, particleComputeShaderVelocity, particleVertexShader, particleFragmentShader } from './shaders.js';

export class ParticleSystem {
    constructor(scene, renderer, velocityField) {
        this.scene = scene;
        this.renderer = renderer;
        this.velocityField = velocityField;
        
        // Streamline parameters
        this.WIDTH = 128;  // Increased for more streamlines
        this.COUNT = this.WIDTH * this.WIDTH;  // 16k particles
        
        this.gpuCompute = null;
        this.velocityVariable = null;
        this.positionVariable = null;
        this.positionUniforms = null;
        this.velocityUniforms = null;
        this.particles = null;
        
        // Plane emitter parameters
        this.emitterWidth = 1.5;
        this.emitterHeight = 1.5;
        this.emitterPosX = -2.0;
        this.emitterPosY = 0.0;
        this.emitterPosZ = 0.0;
        
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

        // Position uniforms
        this.positionUniforms['time'] = { value: 0.0 };
        this.positionUniforms['delta'] = { value: 0.0 };
        this.positionUniforms['maxAge'] = { value: 500.0 };  // Longer lifespan for streamlines
        this.positionUniforms['emitterPos'] = { value: new THREE.Vector3(this.emitterPosX, this.emitterPosY, this.emitterPosZ) };
        this.positionUniforms['emitterWidth'] = { value: this.emitterWidth };
        this.positionUniforms['emitterHeight'] = { value: this.emitterHeight };
        this.positionUniforms['boundsMin'] = { value: new THREE.Vector3(-5, -5, -5) };
        this.positionUniforms['boundsMax'] = { value: new THREE.Vector3(5, 5, 5) };
        this.positionUniforms['speedMultiplier'] = { value: 2.0 };  // Higher speed for visible streamlines

        // Velocity uniforms
        this.velocityUniforms['time'] = { value: 0.0 };
        this.velocityUniforms['delta'] = { value: 0.0 };
        this.velocityUniforms['gridMin'] = { value: new THREE.Vector3(-1, -1, -1) };
        this.velocityUniforms['gridMax'] = { value: new THREE.Vector3(1, 1, 1) };
        this.velocityUniforms['initialDirection'] = { value: new THREE.Vector3(1, 0, 0) };
        this.velocityUniforms['initialSpeed'] = { value: 0.5 };
        this.velocityUniforms['velocityField'] = { value: null };
        this.velocityUniforms['dragCoefficient'] = { value: 0.85 };  // Drag for smooth following

        const error = this.gpuCompute.init();
        if (error !== null) {
            console.error(error);
        }
    }

    fillTextures(texturePosition, textureVelocity) {
        const posArray = texturePosition.image.data;
        const velArray = textureVelocity.image.data;

        for (let k = 0, kl = posArray.length; k < kl; k += 4) {
            // Initialize across the plane emitter
            const particleIndex = k / 4;
            const u = (particleIndex % this.WIDTH) / this.WIDTH;  // 0 to 1
            const v = Math.floor(particleIndex / this.WIDTH) / this.WIDTH;  // 0 to 1

            // Position on plane
            const x = this.emitterPosX;
            const y = this.emitterPosY + (v - 0.5) * this.emitterHeight;
            const z = this.emitterPosZ + (u - 0.5) * this.emitterWidth;

            posArray[k + 0] = x;
            posArray[k + 1] = y;
            posArray[k + 2] = z;
            posArray[k + 3] = Math.random() * 50;  // Random initial age

            // Initial velocity (along X direction)
            velArray[k + 0] = 1.0;
            velArray[k + 1] = 0.0;
            velArray[k + 2] = 0.0;
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
                pointSize: { value: 1.5 }
            },
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Use LINE instead of POINTS for streamlines
        this.particles = new THREE.Line(geometry, material);
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
        if (params.emitterPos) {
            this.positionUniforms['emitterPos'].value.copy(params.emitterPos);
            this.emitterPosX = params.emitterPos.x;
            this.emitterPosY = params.emitterPos.y;
            this.emitterPosZ = params.emitterPos.z;
        }
        if (params.lifespan) this.positionUniforms['maxAge'].value = params.lifespan;
        if (params.speedMultiplier) this.positionUniforms['speedMultiplier'].value = params.speedMultiplier;
        if (params.emitterWidth) this.positionUniforms['emitterWidth'].value = params.emitterWidth;
        if (params.emitterHeight) this.positionUniforms['emitterHeight'].value = params.emitterHeight;
    }
}

export default ParticleSystem;