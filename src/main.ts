import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as Comlink from 'comlink';
import { Pane } from 'tweakpane';
import './style.css';

async function init() {
    // 1. Three.js 기본 설정
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('app')?.appendChild(renderer.domElement);

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

    const worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    const physicsApi = Comlink.wrap<any>(worker);

    let physicsReady = false;
    let isRunning = false;
    let clothMesh: THREE.Mesh | null = null;
    let clothGeom: THREE.PlaneGeometry | null = null;
    let cylinderMesh: THREE.Mesh | null = null;
    let groundMesh: THREE.Mesh | null = null;

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
        if (cylinderMesh) {
            scene.remove(cylinderMesh);
            cylinderMesh.geometry.dispose();
            (cylinderMesh.material as THREE.Material).dispose();
            cylinderMesh = null;
        }
        if (groundMesh) {
            scene.remove(groundMesh);
            groundMesh.geometry.dispose();
            (groundMesh.material as THREE.Material).dispose();
            groundMesh = null;
        }
        await physicsApi.reset();

        // 2.5 바닥 (Ground) 생성
        const groundGeom = new THREE.BoxGeometry(100, 1, 100);
        const groundMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        groundMesh = new THREE.Mesh(groundGeom, groundMat);
        groundMesh.position.set(0, -0.5, 0); // 상단 표면이 y=0에 오도록 설정
        scene.add(groundMesh);
        await physicsApi.createGround();

        // 3. 원통 (Cylinder) 생성
        const cylinderRadius = params.cylinderRadius;
        const cylinderHeight = params.cylinderHeight;
        const cylinderPos = { x: 0, y: cylinderHeight / 2, z: 0 };

        const cylinderGeom = new THREE.CylinderGeometry(cylinderRadius - 0.05, cylinderRadius - 0.05, cylinderHeight - 0.05, 32);
        const cylinderMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
        cylinderMesh = new THREE.Mesh(cylinderGeom, cylinderMat);
        cylinderMesh.position.set(cylinderPos.x, cylinderPos.y, cylinderPos.z);
        scene.add(cylinderMesh);

        await physicsApi.createCylinder(cylinderRadius, cylinderHeight, cylinderPos);

        // 4. 천 (Cloth) 생성
        const clothWidth = 6;
        const clothHeight = 6;
        const segments = params.segments;
        const clothPos = { x: 0, y: cylinderHeight + 2, z: 0 };

        clothGeom = new THREE.PlaneGeometry(clothWidth, clothHeight, segments, segments);
        clothGeom.rotateX(-Math.PI / 2);
        clothGeom.translate(clothPos.x, clothPos.y, clothPos.z);
        
        const clothMat = new THREE.MeshPhongMaterial({ color: params.color, side: THREE.DoubleSide, wireframe: params.wireframe });
        clothMesh = new THREE.Mesh(clothGeom, clothMat);
        scene.add(clothMesh);

        await physicsApi.createCloth(clothWidth, clothHeight, segments, segments, clothPos);

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
        segments: 40,
        cylinderRadius: 2,
        cylinderHeight: 4,
        handTool: false,
        textureRepeat: 1,
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
    });

    const cylinderFolder = pane.addFolder({ title: 'Cylinder Settings' });
    cylinderFolder.addBinding(params, 'cylinderRadius', {
        min: 0.5,
        max: 4,
        step: 0.1,
        label: 'Radius'
    });
    cylinderFolder.addBinding(params, 'cylinderHeight', {
        min: 1,
        max: 8,
        step: 0.1,
        label: 'Height'
    });

    const clothFolder = pane.addFolder({ title: 'Cloth Settings' });
    clothFolder.addBinding(params, 'segments', {
        min: 10,
        max: 80,
        step: 1,
        label: 'Resolution'
    });

    const visualsFolder = pane.addFolder({ title: 'Visuals' });
    visualsFolder.addBinding(params, 'wireframe').on('change', (ev) => {
        if ((window as any).clothMat) (window as any).clothMat.wireframe = ev.value;
    });
    visualsFolder.addBinding(params, 'color').on('change', (ev) => {
        if ((window as any).clothMat) (window as any).clothMat.color.set(ev.value);
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
                        const mat = (window as any).clothMat as THREE.MeshPhongMaterial;
                        
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

    pane.addButton({ title: 'Reset' }).on('click', params.reset);

    // 6. 애니메이션 루프
    const clock = new THREE.Clock();

    async function animate() {
        requestAnimationFrame(animate);

        const deltaTime = Math.min(clock.getDelta(), 0.1);
        
        // Call step if running OR if currently dragging (to update the mesh while paused)
        if (physicsReady && clothGeom && (isRunning || isDragging)) {
            const positions = await physicsApi.step(isRunning ? deltaTime : 0);
            if (positions) {
                const attr = clothGeom.attributes.position;
                (attr.array as Float32Array).set(positions);
                attr.needsUpdate = true;
                clothGeom.computeVertexNormals();
            }
        }

        controls.update();
        renderer.render(scene, camera);
    }

    animate();

    // Mouse Events for Hand Tool
    window.addEventListener('mousedown', async (event) => {
        if (!params.handTool || !clothMesh || !clothGeom) return;

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
                isDragging = true;
                draggedVertexIndex = closestVertexIndex;
                
                // Setup drag plane facing the camera
                const normal = new THREE.Vector3();
                camera.getWorldDirection(normal);
                dragPlane.setFromNormalAndCoplanarPoint(normal.negate(), hitPos);
                
                await physicsApi.pickNode(draggedVertexIndex, { x: hitPos.x, y: hitPos.y, z: hitPos.z });
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

    // 창 크기 조절 대응
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

init();
