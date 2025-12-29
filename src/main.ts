import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import * as Comlink from 'comlink';
import { Pane } from 'tweakpane';
import Stats from 'stats.js';
import './style.css';

async function init() {
    // 0. Stats 설정
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(stats.dom);
    stats.dom.style.cssText = 'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';

    // 1. Three.js 기본 설정
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.getElementById('app')?.appendChild(renderer.domElement);

    // Post-processing for better anti-aliasing (SMAA)
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const smaaPass = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
    composer.addPass(smaaPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    
    // Raycaster for hand tool
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let draggedVertexIndex = -1;
    const dragPlane = new THREE.Plane();
    const dragIntersection = new THREE.Vector3();

    // 시각적 보조 도구 추가
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Store lights for brightness control
    const lights = { ambient: ambientLight, directional: directionalLight };

    const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    const physicsApi = Comlink.wrap<any>(worker);

    let physicsReady = false;
    let isRunning = false;
    let clothMesh: THREE.Mesh | null = null;
    let clothGeom: THREE.PlaneGeometry | null = null;
    let obstacleMesh: THREE.Mesh | null = null;
    let groundMesh: THREE.Mesh | null = null;
    const pinMeshes: Map<number, THREE.Object3D> = new Map();

    const createSampleScene = async () => {
        if (!physicsReady) return;
        isRunning = false; // 샘플 생성 시 시뮬레이션 중지

        // 기존 객체 제거
        if (clothMesh) {
            scene.remove(clothMesh);
            clothMesh.geometry.dispose();
            (clothMesh.material as THREE.Material).dispose();
            clothMesh = null;
        }
        if (obstacleMesh) {
            scene.remove(obstacleMesh);
            obstacleMesh.geometry.dispose();
            (obstacleMesh.material as THREE.Material).dispose();
            obstacleMesh = null;
        }
        if (groundMesh) {
            scene.remove(groundMesh);
            groundMesh.geometry.dispose();
            (groundMesh.material as THREE.Material).dispose();
            groundMesh = null;
        }
        
        // Pin 제거
        pinMeshes.forEach(obj => {
            scene.remove(obj);
            obj.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });
        pinMeshes.clear();

        await physicsApi.reset();

        // 2.5 바닥 (Ground) 생성
        const groundGeom = new THREE.BoxGeometry(100, 1, 100);
        const groundMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        groundMesh = new THREE.Mesh(groundGeom, groundMat);
        groundMesh.position.set(0, -0.5, 0); // 상단 표면이 y=0에 오도록 설정
        scene.add(groundMesh);
        await physicsApi.createGround();

        // 3. 장애물 (Obstacle) 생성
        const obstacleType = params.obstacleType;
        const obstaclePos = { x: 0, y: params.obstacleHeight / 2, z: 0 };
        const obstacleMat = new THREE.MeshPhongMaterial({ color: 0x888888 });

        if (obstacleType === 'Cylinder') {
            const radius = params.obstacleRadius;
            const height = params.obstacleHeight;
            const geom = new THREE.CylinderGeometry(radius - 0.05, radius - 0.05, height - 0.05, 32);
            obstacleMesh = new THREE.Mesh(geom, obstacleMat);
            obstacleMesh.position.set(obstaclePos.x, obstaclePos.y, obstaclePos.z);
            await physicsApi.createCylinder(radius, height, obstaclePos);
        } else if (obstacleType === 'Sphere') {
            const radius = params.obstacleRadius;
            const geom = new THREE.SphereGeometry(radius - 0.05, 32, 32);
            obstacleMesh = new THREE.Mesh(geom, obstacleMat);
            obstacleMesh.position.set(obstaclePos.x, obstaclePos.y, obstaclePos.z);
            await physicsApi.createSphere(radius, obstaclePos);
        } else if (obstacleType === 'Box') {
            const size = params.obstacleRadius * 2; // Use radius as half-size for consistency
            const height = params.obstacleHeight;
            const geom = new THREE.BoxGeometry(size - 0.05, height - 0.05, size - 0.05);
            obstacleMesh = new THREE.Mesh(geom, obstacleMat);
            obstacleMesh.position.set(obstaclePos.x, obstaclePos.y, obstaclePos.z);
            await physicsApi.createBox({ x: size, y: height, z: size }, obstaclePos);
        } else {
            // None: No obstacle created in physics or scene
            obstacleMesh = null;
        }

        if (obstacleMesh) scene.add(obstacleMesh);

        // 4. 천 (Cloth) 생성
        const clothWidth = 6;
        const clothHeight = 6;
        const segments = params.segments;
        // If no obstacle, use a default height or the height parameter
        const startHeight = obstacleType === 'None' ? 4 : params.obstacleHeight + 2;
        const clothPos = { x: 0, y: startHeight, z: 0 };

        clothGeom = new THREE.PlaneGeometry(clothWidth, clothHeight, segments, segments);
        clothGeom.rotateX(-Math.PI / 2);
        clothGeom.translate(clothPos.x, clothPos.y, clothPos.z);
        
        const clothMat = new THREE.MeshPhysicalMaterial({ 
            color: params.color, 
            side: THREE.DoubleSide, 
            wireframe: params.wireframe,
            transparent: params.opacity < 1.0,
            opacity: params.opacity,
            roughness: 0.8,
            metalness: 0.0,
            sheen: 1.0,
            sheenRoughness: 0.5,
            sheenColor: new THREE.Color(0xffffff)
        });
        clothMesh = new THREE.Mesh(clothGeom, clothMat);
        scene.add(clothMesh);

        await physicsApi.createCloth(clothWidth, clothHeight, segments, segments, clothPos, {
            stiffness: params.stiffness,
            bending: params.bending,
            friction: params.friction,
            damping: params.damping,
            mass: params.mass
        });

        // UI 업데이트를 위해 변수 공유
        (window as any).clothMat = clothMat;
    };

    physicsApi.initPhysics().then(() => {
        console.log('Physics initialized');
        physicsReady = true;
    }).catch(err => {
        console.error('Failed to initialize physics:', err);
    });

    // 5. UI (Tweakpane)
    const pane = new Pane();
    const params = {
        wireframe: false,
        color: '#ff0000',
        opacity: 1.0,
        exposure: 1.0,
        showAxes: true,
        showGrid: true,
        segments: 40,
        obstacleType: 'Cylinder',
        obstacleRadius: 2,
        obstacleHeight: 4,
        handTool: false,
        pinTool: false,
        textureRepeat: 1,
        textureType: 'None',
        stiffness: 0.9,
        bending: 0.5,
        friction: 0.5,
        damping: 0.01,
        mass: 0.5,
        preset: 'Custom',
        fps: 0,
        physicsStep: 0,
        memory: 0,
        vertices: 0,
        sample: () => {
            createSampleScene();
        },
        start: () => {
            if (clothGeom) isRunning = true;
        },
        pause: () => {
            isRunning = false;
        },
        reset: () => {
            window.location.reload();
        }
    };

    pane.addButton({ title: 'Sample' }).on('click', params.sample);
    const playBtn = pane.addButton({ title: 'Start' });
    playBtn.on('click', params.start);
    const pauseBtn = pane.addButton({ title: 'Pause' });
    pauseBtn.on('click', params.pause);
    
    const toolFolder = pane.addFolder({ title: 'Tools' });
    toolFolder.addBinding(params, 'handTool', { label: 'Hand Tool' }).on('change', (ev) => {
        controls.enabled = !ev.value; // Disable orbit controls when hand tool is active
        if (ev.value) params.pinTool = false; // Exclusive tools
        pane.refresh();
    });
    toolFolder.addBinding(params, 'pinTool', { label: 'Pin Tool' }).on('change', (ev) => {
        controls.enabled = !ev.value;
        if (ev.value) params.handTool = false; // Exclusive tools
        pane.refresh();
    });

    const obstacleFolder = pane.addFolder({ title: 'Obstacle Settings' });
    obstacleFolder.addBinding(params, 'obstacleType', {
        options: {
            None: 'None',
            Cylinder: 'Cylinder',
            Sphere: 'Sphere',
            Box: 'Box'
        },
        label: 'Type'
    });
    obstacleFolder.addBinding(params, 'obstacleRadius', {
        min: 0.5,
        max: 4,
        step: 0.1,
        label: 'Radius/Size'
    });
    obstacleFolder.addBinding(params, 'obstacleHeight', {
        min: 1,
        max: 8,
        step: 0.1,
        label: 'Height'
    });

    const clothFolder = pane.addFolder({ title: 'Cloth Settings' });
    
    const fabricPresets: Record<string, any> = {
        'Silk': { stiffness: 0.4, bending: 0.1, friction: 0.2, damping: 0.01, mass: 0.2, color: '#ffb6c1' },
        'Cotton': { stiffness: 0.7, bending: 0.5, friction: 0.5, damping: 0.02, mass: 0.5, color: '#ffffff' },
        'Wool': { stiffness: 0.5, bending: 0.3, friction: 0.8, damping: 0.05, mass: 0.8, color: '#f5f5dc' },
        'Denim': { stiffness: 0.9, bending: 0.8, friction: 0.7, damping: 0.03, mass: 1.2, color: '#1560bd' },
        'Custom': {}
    };

    clothFolder.addBinding(params, 'preset', {
        options: {
            Silk: 'Silk',
            Cotton: 'Cotton',
            Wool: 'Wool',
            Denim: 'Denim',
            Custom: 'Custom'
        },
        label: 'Fabric Preset'
    }).on('change', (ev) => {
        const preset = fabricPresets[ev.value];
        if (ev.value !== 'Custom') {
            params.stiffness = preset.stiffness;
            params.bending = preset.bending;
            params.friction = preset.friction;
            params.damping = preset.damping;
            params.mass = preset.mass;
            params.color = preset.color;
            
            if ((window as any).clothMat) {
                (window as any).clothMat.color.set(params.color);
            }
            
            pane.refresh();
            // Update physics parameters without resetting the scene
            physicsApi.updateClothParams({
                stiffness: params.stiffness,
                friction: params.friction,
                damping: params.damping,
                mass: params.mass
            });
        }
    });

    clothFolder.addBinding(params, 'segments', {
        min: 10,
        max: 100,
        step: 1,
        label: 'Resolution'
    });
    clothFolder.addBinding(params, 'stiffness', {
        min: 0.1,
        max: 1.0,
        step: 0.1,
        label: 'Stiffness'
    }).on('change', (ev) => {
        physicsApi.updateClothParams({ stiffness: ev.value });
    });
    clothFolder.addBinding(params, 'bending', {
        min: 0.0,
        max: 1.0,
        step: 0.1,
        label: 'Bending'
    }).on('change', () => {
        // Bending constraints are structural and cannot be updated on the fly 
        // without resetting the soft body. We skip automatic reset to avoid 
        // jumping back to the initial position.
        // New bending will be applied on the next 'Sample' click.
    });
    clothFolder.addBinding(params, 'friction', {
        min: 0.0,
        max: 1.0,
        step: 0.1,
        label: 'Friction'
    }).on('change', (ev) => {
        physicsApi.updateClothParams({ friction: ev.value });
    });
    clothFolder.addBinding(params, 'damping', {
        min: 0.0,
        max: 1.0,
        step: 0.01,
        label: 'Damping'
    }).on('change', (ev) => {
        physicsApi.updateClothParams({ damping: ev.value });
    });
    clothFolder.addBinding(params, 'mass', {
        min: 0.1,
        max: 5.0,
        step: 0.1,
        label: 'Mass'
    }).on('change', (ev) => {
        physicsApi.updateClothParams({ mass: ev.value });
    });

    const visualsFolder = pane.addFolder({ title: 'Visuals' });
    visualsFolder.addBinding(params, 'wireframe').on('change', (ev) => {
        if ((window as any).clothMat) (window as any).clothMat.wireframe = ev.value;
    });
    visualsFolder.addBinding(params, 'color').on('change', (ev) => {
        if ((window as any).clothMat) (window as any).clothMat.color.set(ev.value);
    });
    visualsFolder.addBinding(params, 'opacity', {
        min: 0.0,
        max: 1.0,
        step: 0.01,
        label: 'Opacity'
    }).on('change', (ev) => {
        if ((window as any).clothMat) {
            const mat = (window as any).clothMat as THREE.MeshPhongMaterial;
            mat.opacity = ev.value;
            mat.transparent = ev.value < 1.0;
        }
    });    visualsFolder.addBinding(params, 'exposure', {
        min: 0.0,
        max: 2.0,
        step: 0.1,
        label: 'Brightness'
    }).on('change', (ev) => {
        // Direct light intensity control for more visible change
        lights.ambient.intensity = 0.5 * ev.value;
        lights.directional.intensity = 1.0 * ev.value;
    });    visualsFolder.addBinding(params, 'showAxes', { label: 'Show Axes' }).on('change', (ev) => {
        axesHelper.visible = ev.value;
    });
    visualsFolder.addBinding(params, 'showGrid', { label: 'Show Grid' }).on('change', (ev) => {
        gridHelper.visible = ev.value;
    });

    // Texture Upload
    const textureLoader = new THREE.TextureLoader();
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const url = event.target?.result as string;
                textureLoader.load(url, (texture) => {
                    if ((window as any).clothMat) {
                        const mat = (window as any).clothMat as THREE.MeshPhysicalMaterial;
                        
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(params.textureRepeat, params.textureRepeat);
                        
                        mat.map = texture;
                        mat.needsUpdate = true;
                        // Reset color to white if texture is applied to see it clearly
                        mat.color.set(0xffffff);
                        params.color = '#ffffff';
                        pane.refresh();
                    }
                });
            };
            reader.readAsDataURL(file);
        }
    });

    visualsFolder.addButton({ title: 'Change Texture' }).on('click', () => {
        fileInput.click();
    });

    const textureSamples: Record<string, string> = {
        'None': '',
        'Grid': 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/uv_grid_opengl.jpg',
        'Checker': 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/floors/FloorsCheckerboard_S_Diffuse.jpg',
        'Lava': 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/lava/lavatile.jpg',
        'Brick': 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_diffuse.jpg'
    };

    visualsFolder.addBinding(params, 'textureType', {
        options: {
            None: 'None',
            Grid: 'Grid',
            Checker: 'Checker',
            Lava: 'Lava',
            Brick: 'Brick'
        },
        label: 'Sample Textures'
    }).on('change', (ev) => {
        const url = textureSamples[ev.value];
        if (url) {
            textureLoader.load(url, (texture) => {
                if ((window as any).clothMat) {
                    const mat = (window as any).clothMat as THREE.MeshPhysicalMaterial;
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(params.textureRepeat, params.textureRepeat);
                    mat.map = texture;
                    mat.color.set(0xffffff);
                    mat.needsUpdate = true;
                    params.color = '#ffffff';
                    pane.refresh();
                }
            });
        } else if (ev.value === 'None') {
            if ((window as any).clothMat) {
                const mat = (window as any).clothMat as THREE.MeshPhysicalMaterial;
                mat.map = null;
                mat.needsUpdate = true;
            }
        }
    });

    visualsFolder.addBinding(params, 'textureRepeat', {
        min: 1,
        max: 10,
        step: 1,
        label: 'Texture Repeat'
    }).on('change', (ev) => {
        if ((window as any).clothMat && (window as any).clothMat.map) {
            const texture = (window as any).clothMat.map as THREE.Texture;
            texture.repeat.set(ev.value, ev.value);
        }
    });

    const diagFolder = pane.addFolder({ title: 'Diagnostics', expanded: false });
    diagFolder.addBinding(params, 'physicsStep', { readonly: true, label: 'Physics (ms)', format: (v) => v.toFixed(2) });
    diagFolder.addBinding(params, 'vertices', { readonly: true, label: 'Vertices' });
    if ((performance as any).memory) {
        diagFolder.addBinding(params, 'memory', { readonly: true, label: 'Memory (MB)', format: (v) => v.toFixed(1) });
    }

    pane.addButton({ title: 'Reset' }).on('click', params.reset);

    // 6. 애니메이션 루프
    const clock = new THREE.Clock();

    async function animate() {
        requestAnimationFrame(animate);
        stats.begin();

        const deltaTime = Math.min(clock.getDelta(), 0.1);
        
        // Call step if running OR if currently dragging (to update the mesh while paused)
        if (physicsReady && clothGeom && (isRunning || isDragging)) {
            const result = await physicsApi.step(isRunning ? deltaTime : 0);
            if (result && result.positions) {
                const attr = clothGeom.attributes.position;
                (attr.array as Float32Array).set(result.positions);

                attr.needsUpdate = true;
                clothGeom.computeVertexNormals();
                
                params.physicsStep = result.stepTime;
                params.vertices = attr.count;

                // Update pin positions
                pinMeshes.forEach((mesh, vIdx) => {
                    mesh.position.set(attr.getX(vIdx), attr.getY(vIdx), attr.getZ(vIdx));
                });
            }
        }

        if ((performance as any).memory) {
            params.memory = (performance as any).memory.usedJSHeapSize / 1048576;
        }

        controls.update();
        composer.render();
        
        stats.end();
    }

    animate();

    // 창 크기 조절 대응
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    // Mouse Events for Hand Tool & Pin Tool
    window.addEventListener('mousedown', async (event) => {
        if ((!params.handTool && !params.pinTool) || !clothMesh || !clothGeom) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(clothMesh);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const face = hit.face;
            if (!face) return;

            // Find the closest vertex in the hit face
            const vertices = [face.a, face.b, face.c];
            let minSourceDist = Infinity;
            let closestVertexIndex = -1;

            const posAttr = clothGeom.attributes.position;
            const hitPos = hit.point;

            vertices.forEach((vIdx) => {
                const vx = posAttr.getX(vIdx);
                const vy = posAttr.getY(vIdx);
                const vz = posAttr.getZ(vIdx);
                const dist = hitPos.distanceTo(new THREE.Vector3(vx, vy, vz));
                if (dist < minSourceDist) {
                    minSourceDist = dist;
                    closestVertexIndex = vIdx;
                }
            });

            if (closestVertexIndex !== -1) {
                if (params.handTool) {
                    isDragging = true;
                    draggedVertexIndex = closestVertexIndex;
                    
                    // Setup drag plane facing the camera
                    const normal = new THREE.Vector3();
                    camera.getWorldDirection(normal);
                    dragPlane.setFromNormalAndCoplanarPoint(normal.negate(), hitPos);
                    
                    await physicsApi.pickNode(draggedVertexIndex, { x: hitPos.x, y: hitPos.y, z: hitPos.z });
                } else if (params.pinTool) {
                    if (!pinMeshes.has(closestVertexIndex)) {
                        await physicsApi.pinNode(closestVertexIndex);
                        
                        // Create visual pin (Group of Rod + Head)
                        const pinGroup = new THREE.Group();
                        
                        // Rod (Cylinder)
                        const rodGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8);
                        const rodMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
                        const rodMesh = new THREE.Mesh(rodGeom, rodMat);
                        rodMesh.position.y = 0.1; // Move up so bottom is at 0
                        pinGroup.add(rodMesh);
                        
                        // Head (Sphere)
                        const headGeom = new THREE.SphereGeometry(0.04, 16, 16);
                        const headMat = new THREE.MeshPhongMaterial({ color: 0xffff00 }); // Yellow head
                        const headMesh = new THREE.Mesh(headGeom, headMat);
                        headMesh.position.y = 0.2; // Top of the rod
                        pinGroup.add(headMesh);
                        
                        const posAttr = clothGeom.attributes.position;
                        pinGroup.position.set(posAttr.getX(closestVertexIndex), posAttr.getY(closestVertexIndex), posAttr.getZ(closestVertexIndex));
                        
                        scene.add(pinGroup);
                        pinMeshes.set(closestVertexIndex, pinGroup);
                    }
                }
            }
        }
    });

    window.addEventListener('mousemove', async (event) => {
        if (!isDragging || !params.handTool) return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
            await physicsApi.dragNode({ x: dragIntersection.x, y: dragIntersection.y, z: dragIntersection.z });
        }
    });

    window.addEventListener('mouseup', async () => {
        if (isDragging) {
            isDragging = false;
            draggedVertexIndex = -1;
            await physicsApi.releaseNode();
        }
    });
}

init();
