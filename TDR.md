# TDR (Technical Design Record)

1. 기술 스택 (Tech Stack)
Framework: Vite + TypeScript

Rendering: Three.js (WebGL)

Physics Engine: Ammo.js (WebAssembly version)

Concurrency: Web Workers (병렬 연산) + Comlink (RPC 통신)

UI: Tweakpane (실시간 파라미터 바인딩)

1. 시스템 아키텍처

Main Thread: * Three.js Scene/Camera/Renderer 관리.

Tweakpane UI 이벤트 처리.

Worker로부터 전달받은 정점(Vertex) 데이터를 바탕으로 Mesh 업데이트.

Worker Thread (Physics):

Ammo.js Wasm 모듈 초기화.

btSoftRigidDynamicsWorld 내에서 물리 루프 실행.

SharedArrayBuffer를 사용하여 메인 스레드와 고속 데이터 공유.

1. 물리 엔진 세부 설정 (Ammo.js)

Soft Body (Cloth): * btSoftBodyHelpers.createPatch를 사용하여 생성.

물성 파라미터:

kLST (Linear stiffness): 천의 늘어남 제어.

kAST (Area stiffness): 천의 굽힘 및 형태 유지 제어.

kDP (Damping): 움직임의 감쇠율.

Rigid Body (Cylinder): * btCylinderShape 사용, mass = 0 (정적 오브젝트).

Collision Detection: * 천과 원통 간의 SDF(Signed Distance Field) 기반 충돌 처리.

천의 자가 충돌(Self-collision) 활성화 (fCollision.CL_SS).

1. 성능 최적화 전략
Fixed Time Step: 프레임율에 상관없이 일정한 물리 계산을 위해 world.stepSimulation(1/60, 10) 사용.

Buffer Management: 매 프레임마다 메모리를 새로 할당하지 않고, 기존 Float32Array를 재사용(Reuse)하여 GC(Garbage Collection) 부하 최소화.
