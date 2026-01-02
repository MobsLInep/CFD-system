import * as THREE from 'three';
import { OBJLoader as ThreeOBJLoader } from 'three/addons/loaders/OBJLoader.js';

/**
 * Enhanced OBJLoader with Full Debugging & Error Handling
 * Drop-in replacement for your current OBJLoader with console logging
 */
export class OBJLoader {
    constructor(scene) {
        this.scene = scene;
        this.loader = new ThreeOBJLoader();
        this.currentMesh = null;
        this.debug = true;      // Enable logging
        this.loadId = 0;        // Track load operations
    }

    /**
     * Load OBJ from file with comprehensive error reporting
     */
    loadFromFile(file) {
        const loadId = ++this.loadId;
        this.log(`[Load #${loadId}] Starting file load`, 'info');
        this.log(`[Load #${loadId}] File: ${file.name} (${this.formatFileSize(file.size)})`, 'info');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const text = e.target.result;
                this.log(`[Load #${loadId}] 📖 File read successfully, length: ${text.length}`, 'info');

                try {
                    // Parse OBJ text directly with THREE.OBJLoader's parse method
                    const object = this.loader.parse(text);
                    this.log(`[Load #${loadId}] ✅ Parse successful`, 'success');

                    // Process the parsed object
                    this.processObject(object, loadId);
                    this.log(`[Load #${loadId}] ✅ Mesh set to scene`, 'success');

                    // Return the mesh
                    resolve(this.currentMesh);

                } catch (err) {
                    this.log(`[Load #${loadId}] ❌ Parse error: ${err.message}`, 'error', err);
                    reject(err);
                }
            };

            reader.onerror = (err) => {
                this.log(`[Load #${loadId}] ❌ FileReader error: ${err.message}`, 'error', err);
                reject(err);
            };

            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    this.log(`[Load #${loadId}] 📊 Progress: ${percent}%`, 'progress');
                }
            };

            this.log(`[Load #${loadId}] Starting to read file...`, 'info');
            reader.readAsText(file);
        });
    }

    /**
     * Process loaded object with validation
     */
    processObject(object, loadId = 'unknown') {
        this.log(`[Load #${loadId}] Traversing object hierarchy...`, 'info');

        let geometry = null;
        let meshCount = 0;
        let childCount = 0;

        object.traverse((child) => {
            childCount++;
            if (child.isMesh) {
                meshCount++;
                if (!geometry) {
                    this.log(`[Load #${loadId}] Found mesh: ${child.name || 'unnamed'}`, 'info');
                    geometry = child.geometry.clone();
                } else {
                    this.log(`[Load #${loadId}] ⚠️ Multiple meshes found, using first one`, 'warn');
                }
            }
        });

        this.log(`[Load #${loadId}] Object hierarchy: ${childCount} children, ${meshCount} meshes`, 'info');

        if (!geometry) {
            const error = new Error('No mesh found in OBJ file');
            this.log(`[Load #${loadId}] ❌ ${error.message}`, 'error');
            throw error;
        }

        this.getGeometryStats(geometry, loadId, 'before normalization');
        this.normalizeGeometry(geometry, loadId);
        this.getGeometryStats(geometry, loadId, 'after normalization');

        const material = this.createMaterial();
        const mesh = new THREE.Mesh(geometry, material);

        this.log(`[Load #${loadId}] ✅ Mesh created with material`, 'success');
        this.setMesh(mesh, loadId);
    }

    /**
     * Normalize geometry: center, scale to unit cube, compute normals
     */
    normalizeGeometry(geometry, loadId = 'unknown') {
        this.log(`[Load #${loadId}] Normalizing geometry...`, 'info');

        try {
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            
            if (!bbox) {
                throw new Error('Could not compute bounding box');
            }

            const center = new THREE.Vector3();
            bbox.getCenter(center);
            this.log(`[Load #${loadId}] Bounding box center: (${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`, 'info');

            geometry.translate(-center.x, -center.y, -center.z);
            this.log(`[Load #${loadId}] ✅ Translated to origin`, 'info');

            geometry.computeBoundingBox();
            const bbox2 = geometry.boundingBox;
            const size = new THREE.Vector3();
            bbox2.getSize(size);

            this.log(`[Load #${loadId}] Size before scaling: (${size.x.toFixed(3)}, ${size.y.toFixed(3)}, ${size.z.toFixed(3)})`, 'info');

            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 1.0 / maxDim;

            if (!isFinite(scale)) {
                throw new Error('Invalid scale factor computed');
            }

            geometry.scale(scale, scale, scale);
            this.log(`[Load #${loadId}] ✅ Scaled to unit cube (scale factor: ${scale.toFixed(6)})`, 'info');

            geometry.computeVertexNormals();
            this.log(`[Load #${loadId}] ✅ Vertex normals computed`, 'info');

        } catch (err) {
            this.log(`[Load #${loadId}] ❌ Normalization error: ${err.message}`, 'error', err);
            throw err;
        }
    }

    /**
     * Get geometry statistics for validation
     */
    getGeometryStats(geometry, loadId = 'unknown', stage = 'analysis') {
        const stats = {
            vertices: geometry.attributes.position ? geometry.attributes.position.count : 0,
            triangles: geometry.index ? geometry.index.count / 3 : 0,
            hasNormals: !!geometry.attributes.normal,
            stage: stage
        };
        this.log(`[Load #${loadId}] Geometry stats (${stage}):`, 'info', stats);
        if (stats.vertices === 0) {
            this.log(`[Load #${loadId}] ⚠️ Warning: Geometry has 0 vertices!`, 'warn');
        }
        return stats;
    }

    /**
     * Set mesh in scene with proper cleanup
     */
    setMesh(mesh, loadId = 'unknown') {
        this.log(`[Load #${loadId}] Setting mesh in scene...`, 'info');

        if (this.currentMesh) {
            this.log(`[Load #${loadId}] Removing previous mesh`, 'info');
            this.scene.remove(this.currentMesh);
            if (this.currentMesh.geometry) this.currentMesh.geometry.dispose();
            if (this.currentMesh.material) this.currentMesh.material.dispose();
        }

        this.currentMesh = mesh;
        this.scene.add(this.currentMesh);
        this.log(`[Load #${loadId}] ✅ Mesh added to scene`, 'success');

        const wireframeGeometry = new THREE.WireframeGeometry(mesh.geometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        wireframe.visible = false;
        wireframe.name = 'wireframe';
        mesh.add(wireframe);

        this.log(`[Load #${loadId}] ✅ Wireframe geometry added (hidden by default)`, 'info');
        this.log(`[Load #${loadId}] Scene now contains ${this.scene.children.length} objects`, 'info');
    }

    /**
     * Create PhongMaterial as per spec
     */
    createMaterial() {
        return new THREE.MeshPhongMaterial({
            color: 0x4a5a6a,
            specular: 0x222222,
            shininess: 25,
            side: THREE.DoubleSide
        });
    }

    /**
     * Toggle wireframe visibility
     */
    toggleWireframe(visible) {
        if (this.currentMesh) {
            const wireframe = this.currentMesh.getObjectByName('wireframe');
            if (wireframe) {
                wireframe.visible = visible;
                this.log(`Wireframe ${visible ? 'shown' : 'hidden'}`, 'info');
            }
        } else {
            this.log('❌ No mesh loaded', 'warn');
        }
    }

    /**
     * Toggle mesh visibility
     */
    toggleVisibility(visible) {
        if (this.currentMesh) {
            this.currentMesh.visible = visible;
            this.log(`Mesh ${visible ? 'shown' : 'hidden'}`, 'info');
        } else {
            this.log('❌ No mesh loaded', 'warn');
        }
    }

    /**
     * Get current mesh bounding box info (useful for CFD)
     */
    getMeshBounds() {
        if (!this.currentMesh) {
            this.log('❌ No mesh loaded', 'error');
            return null;
        }

        const box = new THREE.Box3().setFromObject(this.currentMesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const bounds = {
            min: box.min.clone(),
            max: box.max.clone(),
            center: center,
            size: size,
            radius: size.length() / 2
        };

        this.log('Mesh bounds:', 'info', bounds);
        return bounds;
    }

    /**
     * Create a default sphere mesh for testing
     */
    createDefaultSphere() {
        this.log('Creating default sphere mesh...', 'info');
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: 0x4a5a6a,
            specular: 0x222222,
            shininess: 25,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        this.setMesh(mesh, 'default-sphere');
        this.log('✅ Default sphere created', 'success');
        return mesh;
    }

    /**
     * Utility: Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Enhanced logging with colors and formatting
     */
    log(message, level = 'info', data = null) {
        if (!this.debug) return;

        const colors = {
            info: 'color: #3498db; font-weight: bold;',
            success: 'color: #2ecc71; font-weight: bold;',
            warn: 'color: #f39c12; font-weight: bold;',
            error: 'color: #e74c3c; font-weight: bold;',
            progress: 'color: #9b59b6; font-weight: bold;'
        };

        const style = colors[level] || colors.info;
        const prefix = `[OBJLoader] ${message}`;

        if (data !== null && data !== undefined) {
            console.log(`%c${prefix}`, style, data);
        } else {
            console.log(`%c${prefix}`, style);
        }
    }

    /**
     * Enable/disable debug mode
     */
    setDebug(enabled) {
        this.debug = enabled;
        this.log(`Debug mode: ${enabled ? 'ON' : 'OFF'}`, 'info');
    }

    /**
     * Run diagnostics to verify system
     */
    runDiagnostics() {
        console.group('%c🧪 OBJLoader Diagnostics', 'color: #e74c3c; font-size: 14px; font-weight: bold;');

        console.log('1️⃣ THREE available?', typeof THREE !== 'undefined' ? '✅' : '❌');
        console.log('2️⃣ OBJLoader instantiated?', this.loader ? '✅' : '❌');
        console.log('3️⃣ Scene available?', this.scene ? '✅' : '❌');
        console.log('4️⃣ Current mesh loaded?', this.currentMesh ? '✅' : '❌');
        if (performance.memory) {
            console.log('5️⃣ Memory usage:', Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB');
        }
        console.log('6️⃣ File input element:', document.getElementById('obj-file-input') ? '✅' : '❌');

        console.groupEnd();
    }
}

export default OBJLoader;