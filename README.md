# Draping Simulation using ammo.js

Ammo.js의 SoftBody 기능을 활용한 웹 기반 의상 드레이핑 시뮬레이션 프로젝트입니다. Web Workers를 통해 물리 연산을 분리하여 부드러운 성능을 제공합니다.

## 🚀 주요 기능

- **SoftBody 시뮬레이션**: Ammo.js를 이용한 실시간 천(Cloth) 물리 연산.
- **멀티 스레딩**: Web Workers와 Comlink를 사용하여 메인 렌더링 스레드와 물리 연산 스레드를 분리.
- **인터랙티브 컨트롤**: Tweakpane을 통한 실시간 물리 파라미터 조정 및 마우스 드래그를 통한 상호작용.
- **고품질 렌더링**: Three.js와 SMAA 후처리를 통한 깔끔한 그래픽.

## 🛠 기술 스택 (Tech Stack)

### Core
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)

### Graphics & Physics
- **3D Engine**: [Three.js](https://threejs.org/)
- **Physics Engine**: [Ammo.js](https://github.com/kripken/ammo.js/) (WebAssembly version)
- **Post-processing**: SMAA (Subpixel Morphological Antialiasing)

### Utilities
- **Worker Communication**: [Comlink](https://github.com/GoogleChromeLabs/comlink)
- **GUI**: [Tweakpane](https://cocopon.github.io/tweakpane/)
- **Monitoring**: [Stats.js](https://github.com/mrdoob/stats.js/)

## ⚠️ 한계점 (Limitations)

- **연산 부하**: SoftBody 시뮬레이션은 CPU 집약적인 작업으로, 복잡한 메쉬나 다수의 오브젝트가 존재할 경우 프레임 드랍이 발생할 수 있습니다.
- **충돌 정밀도**: 실시간 물리 엔진(Ammo.js)의 특성상, 매우 얇은 물체나 빠른 움직임에 대해 충돌 뚫림(Tunneling) 현상이 발생할 수 있습니다.
- **브라우저 의존성**: WebAssembly 및 Web Workers 지원이 필수적이며, 저사양 기기나 특정 브라우저 환경에서 성능 차이가 클 수 있습니다.
- **물리 파라미터 튜닝**: 천의 재질(Stiffness, Damping 등)을 실제와 유사하게 구현하기 위해 정교한 파라미터 조정이 필요합니다.

## 📦 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
```

## 📂 프로젝트 구조

- `src/main.ts`: Three.js 씬 구성 및 렌더링 루프, UI 제어.
- `src/physics.worker.ts`: Ammo.js 물리 엔진 초기화 및 연산 (Web Worker).
- `public/`: Ammo.js WebAssembly 바이너리 및 정적 자산.
