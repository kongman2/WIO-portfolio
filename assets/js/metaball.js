let canvas, gl, program, uTime, uResolution, uMouse, positionBuffer, mouse, startTime;

// WebGL 초기화
function init() {
  canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) || 
       canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) {
    console.error('WebGL not supported');
    return;
  }
  
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resizeCanvas();
  
  // Throttle resize to avoid conflicts with other resize handlers
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeCanvas, 100);
  }, { passive: true });

// Shader 생성 함수
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

// Vertex Shader
const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Fragment Shader
const fragmentShaderSource = `
  precision highp float;
  
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  
  #define PI 3.14159265359
  #define TAU 6.28318530718
  #define MAX_STEPS 80
  #define MAX_DIST 50.0
  #define SURF_DIST 0.001
  
  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }
  
  float sdSphere(vec3 p, float r) {
    return length(p) - r;
  }
  
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  
  // SDF Scene
  float map(vec3 p) {
    vec2 m = (uMouse - 0.5) * 2.0;
    p.xy += m * 0.4;
    p.z += m.y * 0.2;
    
    p.xz *= rot(uTime * 0.08 + m.x * 0.2);
    p.xy *= rot(uTime * 0.06 + m.y * 0.15);
    
    float d = 100.0;
    
    vec3 p1 = p;
    p1.yz *= rot(uTime * 0.1);
    float core = sdSphere(p1, 0.8);
    d = core;
    
    float k_blend = 0.3;
    
    for(int i = 0; i < 6; i++) {
      float fi = float(i);
      float angle = fi * TAU / 6.0 + uTime * 0.25;
      float radius = 2.1;
      
      float yOffset = 0.0;
      if(i == 0) yOffset = 1.2;
      else if(i == 1) yOffset = -1.0;
      else if(i == 2) yOffset = 0.5;
      else if(i == 3) yOffset = -0.5;
      else if(i == 4) yOffset = 0.8;
      else yOffset = -0.8;
      
      vec3 pos = vec3(
        cos(angle) * radius * 1.1,
        yOffset,
        sin(angle) * radius
      );
      
      vec3 po = p - pos;
      po.xy *= rot(uTime * 0.4 + fi);
      float satellite = sdSphere(po, 0.5);
      d = smin(d, satellite, k_blend);
    }
    
    return d;
  }
  
  vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
      map(p + e.xyy) - map(p - e.xyy),
      map(p + e.yxy) - map(p - e.yxy),
      map(p + e.yyx) - map(p - e.yyx)
    ));
  }
  
  float raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    for(int i = 0; i < MAX_STEPS; i++) {
      vec3 p = ro + rd * t;
      float d = map(p);
      if(abs(d) < SURF_DIST || t > MAX_DIST) break;
      t += d * 0.7;
    }
    return t;
  }
  
  // 배경 그라데이션
  vec3 getBackground(vec3 rd) {
    float yPos = rd.y * 0.5 + 0.5;
    float xPos = atan(rd.x, rd.z) / TAU + 0.5;
    
    vec3 topPink = vec3(1.0, 0.9, 0.95);
    vec3 topYellow = vec3(1.0, 0.98, 0.95);
    vec3 topColor = mix(topPink, topYellow, smoothstep(0.3, 0.7, xPos));
    
    vec3 middleWhite = vec3(1.0, 1.0, 1.0);
    vec3 middleSky = vec3(0.9, 0.95, 1.0);
    vec3 middleColor = mix(middleWhite, middleSky, smoothstep(0.5, 0.8, yPos));
    
    vec3 bottomSky = vec3(0.85, 0.92, 1.0);
    vec3 bottomSkyDarker = vec3(0.8, 0.9, 1.0);
    vec3 bottomColor = mix(bottomSky, bottomSkyDarker, smoothstep(0.3, 0.7, xPos));
    
    vec3 bottomLeft = mix(
      bottomColor,
      vec3(1.0, 0.98, 0.95),
      smoothstep(0.0, 0.3, xPos) * smoothstep(0.6, 1.0, 1.0 - yPos)
    );
    
    vec3 bottomRight = mix(
      bottomLeft,
      vec3(1.0, 0.9, 0.95),
      smoothstep(0.7, 1.0, xPos) * smoothstep(0.6, 1.0, 1.0 - yPos)
    );
    
    vec3 color;
    if(yPos > 0.65) {
      color = mix(topColor, middleColor, smoothstep(0.65, 0.85, yPos));
    } else if(yPos > 0.45) {
      color = mix(middleColor, bottomRight, smoothstep(0.45, 0.65, yPos));
    } else {
      color = bottomRight;
    }
    
    return color;
  }
  
  // 메인 렌더링
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
    
    vec2 m = (uMouse - 0.5) * 0.6;
    vec3 ro = vec3(m.x * 1.5, m.y * 1.5, 5.5);
    vec3 rd = normalize(vec3(uv, -1.0));
    
    rd.xy *= rot(m.x * 0.25);
    rd.yz *= rot(m.y * 0.25);
    
    float t = raymarch(ro, rd);
    
    vec3 color = vec3(0.0);
    
    if(t < MAX_DIST) {
      vec3 p = ro + rd * t;
      vec3 normal = getNormal(p);
      vec3 viewDir = normalize(ro - p);
      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
      
      float ior = 1.52;
      vec3 refractDir = refract(rd, normal, 1.0 / ior);
      
      if(length(refractDir) > 0.0) {
        float t2 = raymarch(p - normal * 0.01, refractDir);
        
        if(t2 < MAX_DIST) {
          vec3 p2 = p - normal * 0.01 + refractDir * t2;
          vec3 normal2 = getNormal(p2);
          
          vec3 r = refract(refractDir, -normal2, ior - 0.15);
          vec3 g = refract(refractDir, -normal2, ior);
          vec3 b = refract(refractDir, -normal2, ior + 0.15);
          
          vec3 n = normal2;
          float angleX = atan(n.x, n.z) / PI;
          float angleY = n.y;
          
          vec3 pink = vec3(0.95, 0.6, 0.75);
          vec3 sky = vec3(0.5, 0.75, 0.9);
          vec3 yellow = vec3(0.95, 0.85, 0.6);
          vec3 cream = vec3(0.9, 0.88, 0.8);
          
          vec3 colorX = mix(pink, sky, angleX * 0.5 + 0.5);
          vec3 colorY = mix(yellow, cream, angleY * 0.5 + 0.5);
          vec3 baseColor = mix(colorX, colorY, 0.5);
          
          vec3 bgR = getBackground(r);
          vec3 bgG = getBackground(g);
          vec3 bgB = getBackground(b);
          
          vec3 prismColor = vec3(bgR.x * 0.3 + bgG.x * 0.2 + bgB.x * 0.2,
                                 bgR.y * 0.2 + bgG.y * 0.3 + bgB.y * 0.2,
                                 bgR.z * 0.2 + bgG.z * 0.2 + bgB.z * 0.3);
          
          color = mix(baseColor, prismColor, 0.3);
          color = pow(color, vec3(0.9)) * 1.5;
          
        } else {
          vec3 bg = getBackground(refractDir);
          vec3 cream = vec3(0.9, 0.88, 0.8);
          color = mix(bg * 1.2, cream, 0.3);
        }
      }
      
      vec3 lightDir = normalize(vec3(1.0, 1.2, -0.8));
      vec3 halfDir = normalize(lightDir + viewDir);
      
      float spec = pow(max(dot(normal, halfDir), 0.0), 120.0);
      vec3 highlightColor = vec3(0.95, 0.9, 0.85);
      color += spec * highlightColor * 1.8;
      
      float normalAngle = atan(normal.x, normal.z) / PI;
      float normalHeight = normal.y;
      
      vec3 pinkFresnel = vec3(0.95, 0.7, 0.8);
      vec3 skyFresnel = vec3(0.6, 0.8, 0.95);
      vec3 yellowFresnel = vec3(0.95, 0.85, 0.7);
      vec3 creamFresnel = vec3(0.9, 0.88, 0.8);
      
      vec3 fresnelColor1 = mix(pinkFresnel, skyFresnel, normalAngle * 0.5 + 0.5);
      vec3 fresnelColor2 = mix(yellowFresnel, creamFresnel, normalHeight * 0.5 + 0.5);
      vec3 mixedFresnel = mix(fresnelColor1, fresnelColor2, fresnel);
      color += fresnel * mixedFresnel * 0.5;
      
      float edge = pow(1.0 - abs(dot(viewDir, normal)), 3.0);
      float edgeAngle = atan(normal.x, normal.z) / PI;
      vec3 edgeColor = mix(vec3(0.6, 0.75, 0.9), vec3(0.9, 0.75, 0.85), edgeAngle * 0.5 + 0.5);
      color += edge * edgeColor * 0.4;
      
      float sss = pow(max(dot(-normal, lightDir), 0.0), 1.5);
      float sssAngle = normal.y;
      vec3 sssColor = mix(vec3(0.9, 0.7, 0.8), vec3(0.95, 0.85, 0.8), sssAngle * 0.5 + 0.5);
      color += sss * sssColor * 0.3;
      
      float posAngle = atan(p.x, p.z) / PI;
      float posHeight = p.y * 0.3;
      vec3 pink = vec3(0.95, 0.6, 0.75);
      vec3 sky = vec3(0.5, 0.75, 0.9);
      vec3 yellow = vec3(0.95, 0.85, 0.6);
      vec3 cream = vec3(0.9, 0.88, 0.8);
      
      vec3 baseColor1 = mix(pink, sky, posAngle * 0.5 + 0.5);
      vec3 baseColor2 = mix(yellow, cream, posHeight * 0.5 + 0.5);
      vec3 baseColor = mix(baseColor1, baseColor2, 0.5);
      color = mix(color, baseColor, 0.25);
      
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    
    float vignette = 1.0 - length(uv) * 0.3;
    vignette = smoothstep(0.4, 1.0, vignette);
    color *= vignette;
    
    color *= vec3(0.95, 0.96, 0.97);
    color = pow(color, vec3(0.95));
    color *= 0.9;
    color = mix(color, vec3(0.85, 0.83, 0.8), 0.1);
    color = clamp(color, 0.0, 1.0);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  program = createProgram(gl, vertexShader, fragmentShader);

  if (!program) {
    console.error('Failed to create shader program');
    return;
  }

  uTime = gl.getUniformLocation(program, 'uTime');
  uResolution = gl.getUniformLocation(program, 'uResolution');
  uMouse = gl.getUniformLocation(program, 'uMouse');

  const positions = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]);
  positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  mouse = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };

  // 마우스/터치 이벤트
  function updateMousePosition(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.targetX = (e.clientX - rect.left) / rect.width;
    mouse.targetY = 1.0 - (e.clientY - rect.top) / rect.height;
  }

  window.addEventListener('mousemove', updateMousePosition);
  canvas.addEventListener('mousemove', updateMousePosition);
  
  // Touch events - only prevent default on canvas, not on window
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      updateMousePosition(e.touches[0]);
    }
  }, { passive: false });
  
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      updateMousePosition(e.touches[0]);
    }
  }, { passive: false });

  startTime = Date.now();

  // 렌더링 루프
  function render() {
    if (!gl || !program) return;
    
    const currentTime = (Date.now() - startTime) * 0.001;
    
    mouse.x += (mouse.targetX - mouse.x) * 0.08;
    mouse.y += (mouse.targetY - mouse.y) * 0.08;
    
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    
    gl.uniform1f(uTime, currentTime);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    
    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    requestAnimationFrame(render);
  }

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
