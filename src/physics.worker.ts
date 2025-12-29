import * as Comlink from 'comlink';

// Ammo.js 타입 정의가 없으므로 any를 사용하거나 필요한 부분만 정의합니다.
declare var Ammo: any;

let physicsWorld: any;
let softBodyHelpers: any;
let rigidBodies: any[] = [];
let softBodies: any[] = [];

let ammoInstance: any;
let draggedNodeIndex: number = -1;
let dragTargetPos: any = null;

async function initPhysics() {
    try {
        // Module Worker에서는 importScripts를 사용할 수 없으므로 fetch + eval로 대체합니다.
        const response = await fetch(self.location.origin + '/ammo.wasm.js');
        if (!response.ok) throw new Error('Failed to fetch ammo.wasm.js');
        const script = await response.text();
        
        // 전역 범위에서 실행되도록 eval 사용
        (0, eval)(script);

        if (typeof (self as any).Ammo === 'undefined') {
            throw new Error('Ammo is not defined after loading script');
        }

        // Ammo 초기화
        ammoInstance = await (self as any).Ammo({
            locateFile: (path: string) => {
                if (path.endsWith('.wasm')) {
                    return self.location.origin + '/ammo.wasm.wasm';
                }
                return path;
            }
        });

    const collisionConfiguration = new ammoInstance.btSoftBodyRigidBodyCollisionConfiguration();
    const dispatcher = new ammoInstance.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new ammoInstance.btDbvtBroadphase();
    const solver = new ammoInstance.btSequentialImpulseConstraintSolver();
    const softBodySolver = new ammoInstance.btDefaultSoftBodySolver();
    
    physicsWorld = new ammoInstance.btSoftRigidDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration, softBodySolver);
    physicsWorld.setGravity(new ammoInstance.btVector3(0, -9.8, 0));
    physicsWorld.getWorldInfo().set_m_gravity(new ammoInstance.btVector3(0, -9.8, 0));

    if (ammoInstance.btSoftBodyHelpers) {
        softBodyHelpers = new ammoInstance.btSoftBodyHelpers();
    } else {
        console.error('btSoftBodyHelpers not found in Ammo instance. Soft body support might be missing.');
    }

    return true;
    } catch (error) {
        console.error('Ammo initialization failed in worker:', error);
        throw error;
    }
}

function createGround() {
    const ammo = ammoInstance;
    const transform = new ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new ammo.btVector3(0, -0.5, 0)); // Box center at y=-0.5 to have surface at y=0
    
    const motionState = new ammo.btDefaultMotionState(transform);
    const colShape = new ammo.btBoxShape(new ammo.btVector3(50, 0.5, 50));
    colShape.setMargin(0.05);

    const localInertia = new ammo.btVector3(0, 0, 0);
    const rbInfo = new ammo.btRigidBodyConstructionInfo(0, motionState, colShape, localInertia);
    const body = new ammo.btRigidBody(rbInfo);
    body.setFriction(0.5);

    physicsWorld.addRigidBody(body);
    rigidBodies.push(body);
}

function createCylinder(radius: number, height: number, position: {x: number, y: number, z: number}) {
    const ammo = ammoInstance;
    const transform = new ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new ammo.btVector3(position.x, position.y, position.z));
    
    const motionState = new ammo.btDefaultMotionState(transform);
    const colShape = new ammo.btCylinderShape(new ammo.btVector3(radius, height / 2, radius));
    colShape.setMargin(0.1);

    const localInertia = new ammo.btVector3(0, 0, 0);
    const rbInfo = new ammo.btRigidBodyConstructionInfo(0, motionState, colShape, localInertia);
    const body = new ammo.btRigidBody(rbInfo);

    physicsWorld.addRigidBody(body);
    rigidBodies.push(body);
}

function createSphere(radius: number, position: {x: number, y: number, z: number}) {
    const ammo = ammoInstance;
    const transform = new ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new ammo.btVector3(position.x, position.y, position.z));
    
    const motionState = new ammo.btDefaultMotionState(transform);
    const colShape = new ammo.btSphereShape(radius);
    colShape.setMargin(0.1);

    const localInertia = new ammo.btVector3(0, 0, 0);
    const rbInfo = new ammo.btRigidBodyConstructionInfo(0, motionState, colShape, localInertia);
    const body = new ammo.btRigidBody(rbInfo);

    physicsWorld.addRigidBody(body);
    rigidBodies.push(body);
}

function createBox(size: {x: number, y: number, z: number}, position: {x: number, y: number, z: number}) {
    const ammo = ammoInstance;
    const transform = new ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new ammo.btVector3(position.x, position.y, position.z));
    
    const motionState = new ammo.btDefaultMotionState(transform);
    const colShape = new ammo.btBoxShape(new ammo.btVector3(size.x / 2, size.y / 2, size.z / 2));
    colShape.setMargin(0.1);

    const localInertia = new ammo.btVector3(0, 0, 0);
    const rbInfo = new ammo.btRigidBodyConstructionInfo(0, motionState, colShape, localInertia);
    const body = new ammo.btRigidBody(rbInfo);

    physicsWorld.addRigidBody(body);
    rigidBodies.push(body);
}

function createCloth(width: number, height: number, segmentsW: number, segmentsH: number, position: {x: number, y: number, z: number}, physicsParams: any) {
    const ammo = ammoInstance;
    
    const clothCorner00 = new ammo.btVector3(position.x - width / 2, position.y, position.z - height / 2);
    const clothCorner01 = new ammo.btVector3(position.x + width / 2, position.y, position.z - height / 2);
    const clothCorner10 = new ammo.btVector3(position.x - width / 2, position.y, position.z + height / 2);
    const clothCorner11 = new ammo.btVector3(position.x + width / 2, position.y, position.z + height / 2);

    const clothSoftBody = softBodyHelpers.CreatePatch(
        physicsWorld.getWorldInfo(),
        clothCorner00,
        clothCorner01,
        clothCorner10,
        clothCorner11,
        segmentsW + 1,
        segmentsH + 1,
        0, // fixed corners
        true
    );

    const sbConfig = clothSoftBody.get_m_cfg();
    sbConfig.set_viterations(20);
    sbConfig.set_piterations(20);
    sbConfig.set_collisions(0x11); // SDF_RS | CL_SELF

    // Apply physics parameters
    if (physicsParams) {
        sbConfig.set_kDP(physicsParams.damping || 0.01);
        sbConfig.set_kDF(physicsParams.friction || 0.5);
        
        const material = clothSoftBody.get_m_materials().at(0);
        material.set_m_kLST(physicsParams.stiffness || 0.9);
        material.set_m_kAST(physicsParams.stiffness || 0.9);
        
        clothSoftBody.setTotalMass(physicsParams.mass || 0.5, false);
    } else {
        // Default values
        clothSoftBody.get_m_materials().at(0).set_m_kLST(0.9);
        clothSoftBody.get_m_materials().at(0).set_m_kAST(0.9);
        clothSoftBody.setTotalMass(0.5, false);
    }

    // Generate clusters for self-collision if using CL_SELF (0x10)
    // For very high resolutions, automatic cluster generation (0) can cause OOM.
    if (segmentsW * segmentsH <= 2500) { // Up to 50x50
        clothSoftBody.generateClusters(0);
    } else {
        // For higher resolutions, use a fixed number of clusters to avoid OOM
        clothSoftBody.generateClusters(16);
    }

    ammo.castObject(clothSoftBody, ammo.btCollisionObject).getCollisionShape().setMargin(0.1);
    
    // Disable sleeping for the cloth so it can always be interacted with
    clothSoftBody.setActivationState(4); // DISABLE_DEACTIVATION

    physicsWorld.addSoftBody(clothSoftBody, 1, -1);
    softBodies.push(clothSoftBody);
    
    return clothSoftBody;
}

function step(deltaTime: number) {
    if (!physicsWorld) return;

    const startTime = performance.now();

    // Handle dragging
    if (draggedNodeIndex !== -1 && dragTargetPos && softBodies.length > 0) {
        const softBody = softBodies[0];
        const node = softBody.get_m_nodes().at(draggedNodeIndex);
        const ammo = ammoInstance;
        
        const currentPos = node.get_m_x();
        const targetPos = new ammo.btVector3(dragTargetPos.x, dragTargetPos.y, dragTargetPos.z);
        
        // Directly set position and zero out velocity for a "stiff" drag
        node.set_m_x(targetPos);
        node.set_m_v(new ammo.btVector3(0, 0, 0));
    }

    physicsWorld.stepSimulation(deltaTime, 10);

    const stepTime = performance.now() - startTime;

    // 천의 정점 데이터 업데이트
    const softBody = softBodies[0];
    if (!softBody) return { positions: null, stepTime };

    const nodes = softBody.get_m_nodes();
    const numNodes = nodes.size();
    const positions = new Float32Array(numNodes * 3);

    for (let i = 0; i < numNodes; i++) {
        const node = nodes.at(i);
        const pos = node.get_m_x();
        positions[i * 3] = pos.x();
        positions[i * 3 + 1] = pos.y();
        positions[i * 3 + 2] = pos.z();
    }

    return {
        positions: Comlink.transfer(positions, [positions.buffer]),
        stepTime
    };
}

function reset() {
    if (!physicsWorld) return;

    // Remove soft bodies
    for (let i = 0; i < softBodies.length; i++) {
        physicsWorld.removeSoftBody(softBodies[i]);
        // Ammo.destroy might not be available for all objects, but we should try to clean up
        try { ammoInstance.destroy(softBodies[i]); } catch(e) {}
    }
    softBodies = [];

    // Remove rigid bodies
    for (let i = 0; i < rigidBodies.length; i++) {
        physicsWorld.removeRigidBody(rigidBodies[i]);
        try {
            if (rigidBodies[i].getMotionState()) ammoInstance.destroy(rigidBodies[i].getMotionState());
            ammoInstance.destroy(rigidBodies[i]);
        } catch(e) {}
    }
    rigidBodies = [];
    
    draggedNodeIndex = -1;
    dragTargetPos = null;
}

function pickNode(nodeIndex: number, position: {x: number, y: number, z: number}) {
    draggedNodeIndex = nodeIndex;
    dragTargetPos = position;
}

function dragNode(position: {x: number, y: number, z: number}) {
    dragTargetPos = position;
}

function releaseNode() {
    draggedNodeIndex = -1;
    dragTargetPos = null;
}

function pinNode(nodeIndex: number) {
    if (softBodies.length === 0) return;
    const softBody = softBodies[0];
    const node = softBody.get_m_nodes().at(nodeIndex);
    // Set inverse mass to 0 to fix the node in place
    node.set_m_im(0);
}

const api = {
    initPhysics,
    createGround,
    createCylinder,
    createSphere,
    createBox,
    createCloth,
    step,
    reset,
    pickNode,
    dragNode,
    releaseNode,
    pinNode
};

Comlink.expose(api);
