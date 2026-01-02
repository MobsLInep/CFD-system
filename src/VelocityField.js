import * as THREE from 'three';

export class VelocityField {
    constructor(scene) {
        this.scene = scene;
        this.resolution = 64;
        this.bounds = new THREE.Box3(
            new THREE.Vector3(-1.2, -1.2, -1.2),
            new THREE.Vector3(1.2, 1.2, 1.2)
        );

        // 3D Texture
        this.texture = null;
        this.data = null;

        // Helper
        this.helper = null;
    }

    generate(mesh, params) {
        const { resolution, method, flowParams } = params;
        this.resolution = parseInt(resolution);
        const size = this.resolution * this.resolution * this.resolution;
        const data = new Float32Array(size * 4); // RGBA (A unused or for boundary)

        const boxMin = new THREE.Vector3(-1.0, -1.0, -1.0);
        const boxMax = new THREE.Vector3(1.0, 1.0, 1.0);
        const boxSize = new THREE.Vector3().subVectors(boxMax, boxMin);
        const step = new THREE.Vector3().copy(boxSize).divideScalar(this.resolution - 1);

        // Raycaster for obstacle avoidance
        const raycaster = new THREE.Raycaster();
        const rayDir = new THREE.Vector3(0, 1, 0);

        // Compute mesh bounding box ONCE before loop
        let meshBbox = null;
        if (mesh && mesh.geometry) {
            mesh.geometry.computeBoundingBox();
            meshBbox = mesh.geometry.boundingBox ? mesh.geometry.boundingBox.clone() : null;
        }

        // Generate field
        const pos = new THREE.Vector3();
        const r = new THREE.Vector3();

        for (let z = 0; z < this.resolution; z++) {
            for (let y = 0; y < this.resolution; y++) {
                for (let x = 0; x < this.resolution; x++) {
                    const i = (z * this.resolution * this.resolution) + (y * this.resolution) + x;
                    const stride = i * 4;

                    // Grid cell position
                    pos.set(
                        boxMin.x + x * step.x,
                        boxMin.y + y * step.y,
                        boxMin.z + z * step.z
                    );

                    // Default Freestream
                    let vx = 0, vy = 0, vz = 0;

                    if (method === 'potential') {
                        // V_uniform
                        vx += 1.0; // Default flow X
                    } else if (method === 'radial') {
                        r.copy(pos);
                        const dist = r.length();
                        if (dist > 0.1) {
                            r.normalize();
                            vx = r.x;
                            vy = r.y;
                            vz = r.z;
                        }
                    }

                    // Obstacle Avoidance
                    let inside = false;
                    if (mesh && meshBbox) {
                        // Check if point is inside mesh bounding box
                        if (meshBbox.containsPoint(pos)) {
                            // Do expensive raycast only if in bbox
                            raycaster.set(pos, rayDir);
                            const intersects = raycaster.intersectObject(mesh, true);
                            
                            // Odd number of intersections = inside
                            if (intersects.length % 2 === 1) {
                                inside = true;
                            }
                        }
                    }

                    if (inside) {
                        vx = 0;
                        vy = 0;
                        vz = 0;
                    }

                    data[stride] = vx;
                    data[stride + 1] = vy;
                    data[stride + 2] = vz;
                    data[stride + 3] = 0; // Padding
                }
            }
        }

        this.data = data;

        // Create Texture
        if (this.texture) this.texture.dispose();
        this.texture = new THREE.Data3DTexture(data, this.resolution, this.resolution, this.resolution);
        this.texture.format = THREE.RGBAFormat;
        this.texture.type = THREE.FloatType;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.unpackAlignment = 1;
        this.texture.needsUpdate = true;

        console.log("✅ Velocity Field Generated", {
            resolution: this.resolution,
            method: method,
            hasObstacle: !!mesh
        });
    }

    update() {
        // Called during animation if needed for dynamic fields
    }
}

export default VelocityField;