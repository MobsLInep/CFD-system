export const particleComputeShaderPosition = `
uniform float time;
uniform float delta;
uniform float maxAge;
uniform vec3 emitterPos;
uniform float emissionRate;
uniform vec3 boundsMin;
uniform vec3 boundsMax;
uniform float speedMultiplier;
uniform int emissionShape;
uniform float emissionRadius;

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

    pos += vel * delta * speedMultiplier;
    age += delta * 60.0;

    float myMaxAge = maxAge * (0.8 + 0.4 * rand(uv));

    if (age >= myMaxAge ||
        pos.x < boundsMin.x || pos.x > boundsMax.x ||
        pos.y < boundsMin.y || pos.y > boundsMax.y ||
        pos.z < boundsMin.z || pos.z > boundsMax.z) {

        float r1 = rand(uv + time);
        float r2 = rand(uv + time * 1.1);
        float r3 = rand(uv + time * 1.2);

        if (emissionShape == 0) {
            pos = emitterPos + (vec3(r1, r2, r3) - 0.5) * 0.01;
        } else if (emissionShape == 1) {
            float angle = r1 * 6.28318;
            float r = sqrt(r2) * emissionRadius;
            pos = emitterPos + vec3(0.0, r * cos(angle), r * sin(angle));
        } else {
            vec3 dir = vec3(r1, r2, r3) - 0.5;
            if (length(dir) > 0.001) dir = normalize(dir);
            float r = pow(r1, 0.333333) * emissionRadius;
            pos = emitterPos + dir * r;
        }

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

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 posData = texture2D(texturePosition, uv);
    vec3 pos = posData.xyz;
    float age = posData.w;
    vec4 velData = texture2D(textureVelocity, uv);
    vec3 vel = velData.xyz;

    if (age <= 0.0 || age < delta * 60.0 * 1.5) {
        vel = normalize(initialDirection) * initialSpeed;
    }

    vec3 texCoord = (pos - gridMin) / (gridMax - gridMin);

    if (texCoord.x >= 0.0 && texCoord.x <= 1.0 &&
        texCoord.y >= 0.0 && texCoord.y <= 1.0 &&
        texCoord.z >= 0.0 && texCoord.z <= 1.0) {
        vec4 fieldVel = texture(velocityField, texCoord);
        vel = mix(vel, fieldVel.xyz, 0.2);
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
    vec4 posData = texture2D(texturePosition, position.xy);
    vec3 pos = posData.xyz;
    float age = posData.w;

    vec4 velData = texture2D(textureVelocity, position.xy);
    vVelocity = velData.xyz;
    vAge = age;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    gl_PointSize = pointSize * (10.0 / -mvPosition.z);
}
`;

export const particleFragmentShader = `
precision mediump float;

varying vec3 vVelocity;
varying float vAge;

void main() {
    float vMag = length(vVelocity);
    float vNorm = clamp(vMag / 2.0, 0.0, 1.0);

    vec3 color;

    if (vNorm < 0.25) {
        color = mix(vec3(0.13, 0.59, 0.95), vec3(0.0, 0.74, 0.83), vNorm * 4.0);
    } else if (vNorm < 0.5) {
        color = mix(vec3(0.0, 0.74, 0.83), vec3(0.61, 0.15, 0.69), (vNorm - 0.25) * 4.0);
    } else if (vNorm < 0.75) {
        color = mix(vec3(0.61, 0.15, 0.69), vec3(1.0, 0.6, 0.0), (vNorm - 0.5) * 4.0);
    } else {
        color = mix(vec3(1.0, 0.6, 0.0), vec3(0.96, 0.26, 0.21), (vNorm - 0.75) * 4.0);
    }

    vec2 coord = gl_PointCoord - vec2(0.5);
    if (length(coord) > 0.5) discard;

    float alpha = 1.0;
    gl_FragColor = vec4(color, alpha);
}
`;