export const particleComputeShaderPosition = `
uniform float time;
uniform float delta;
uniform float maxAge;
uniform vec3 emitterPos;
uniform float emitterWidth;
uniform float emitterHeight;
uniform vec3 boundsMin;
uniform vec3 boundsMax;
uniform float speedMultiplier;

float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 posData = texture2D(texturePosition, uv);
    vec3 pos = posData.xyz;
    float age = posData.w;
    vec4 velData = texture2D(textureVelocity, uv);
    vec3 vel = velData.xyz;

    // Update position with velocity field
    pos += vel * delta * speedMultiplier;
    age += delta * 60.0;

    // Random lifespan variance
    float myMaxAge = maxAge * (0.9 + 0.1 * rand(uv));

    // Reset if dead or out of bounds
    if (age >= myMaxAge ||
        pos.x < boundsMin.x || pos.x > boundsMax.x ||
        pos.y < boundsMin.y || pos.y > boundsMax.y ||
        pos.z < boundsMin.z || pos.z > boundsMax.z) {

        // Spawn uniformly across plane emitter
        float u = uv.x;  // 0 to 1
        float v = uv.y;  // 0 to 1
        
        float r1 = rand(uv + time);
        float r2 = rand(uv + time * 1.1);
        float r3 = rand(uv + time * 1.2);

        // Plane emitter: YZ plane at X position
        float y = emitterPos.y + (v - 0.5) * emitterHeight;
        float z = emitterPos.z + (u - 0.5) * emitterWidth;
        
        pos = vec3(emitterPos.x + r1 * 0.05, y + r2 * 0.01, z + r3 * 0.01);
        age = 0.0;
    }

    gl_FragColor = vec4(pos, age);
}
`;

export const particleComputeShaderVelocity = `
precision highp float;
precision highp sampler3D;

uniform float time;
uniform float delta;
uniform sampler3D velocityField;
uniform vec3 gridMin;
uniform vec3 gridMax;
uniform vec3 initialDirection;
uniform float initialSpeed;
uniform float dragCoefficient;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 posData = texture2D(texturePosition, uv);
    vec3 pos = posData.xyz;
    float age = posData.w;
    vec4 velData = texture2D(textureVelocity, uv);
    vec3 vel = velData.xyz;

    // Newly spawned particles get initial velocity
    if (age <= delta * 60.0 * 2.0) {
        vel = normalize(initialDirection) * initialSpeed;
    }

    // Sample Velocity Field
    vec3 texCoord = (pos - gridMin) / (gridMax - gridMin);

    // Check if inside grid
    if (texCoord.x >= 0.0 && texCoord.x <= 1.0 &&
        texCoord.y >= 0.0 && texCoord.y <= 1.0 &&
        texCoord.z >= 0.0 && texCoord.z <= 1.0) {
        
        vec4 fieldVel = texture(velocityField, texCoord);
        
        // Strong advection - particles follow flow field closely
        vel = mix(vel, fieldVel.xyz, 0.3);
    }

    gl_FragColor = vec4(vel, 0.0);
}
`;

export const particleVertexShader = `
uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
uniform float pointSize;

varying vec3 vVelocity;
varying float vAge;

void main() {
    // Read position from texture
    vec4 posData = texture2D(texturePosition, position.xy);
    vec3 pos = posData.xyz;
    float age = posData.w;

    vec4 velData = texture2D(textureVelocity, position.xy);
    vVelocity = velData.xyz;
    vAge = age;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Constant point size for streamlines
    gl_PointSize = pointSize;
}
`;

export const particleFragmentShader = `
precision mediump float;

varying vec3 vVelocity;
varying float vAge;

void main() {
    // Color based on velocity magnitude (speed gradient)
    float vMag = length(vVelocity);
    float vNorm = clamp(vMag / 3.0, 0.0, 1.0);  // Normalized 0-3 speed range

    // Gradient: Blue (slow) -> Cyan -> Yellow -> Orange -> Red (fast)
    vec3 color;

    if (vNorm < 0.2) {
        // Blue to Cyan
        color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), vNorm / 0.2);
    } else if (vNorm < 0.4) {
        // Cyan to Green
        color = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (vNorm - 0.2) / 0.2);
    } else if (vNorm < 0.6) {
        // Green to Yellow
        color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (vNorm - 0.4) / 0.2);
    } else if (vNorm < 0.8) {
        // Yellow to Orange
        color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.6, 0.0), (vNorm - 0.6) / 0.2);
    } else {
        // Orange to Red
        color = mix(vec3(1.0, 0.6, 0.0), vec3(1.0, 0.0, 0.0), (vNorm - 0.8) / 0.2);
    }

    // Circle shape
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (length(coord) > 0.5) discard;

    // Fade out with age (optional visual effect)
    float alpha = 1.0;
    gl_FragColor = vec4(color, alpha);
}
`;