# PDR (Product Design Record)

1. 프로젝트 개요
명칭: Web Cloth Draping Simulator

목적: 사용자가 웹 브라우저에서 천(Cloth)의 물성을 설정하고, 원통(Cylinder) 위로 떨어뜨려 실시간 드레이핑(Draping) 결과를 확인하는 물리 시뮬레이터.

1. 핵심 사용자 시나리오

초기화: 중앙에 고정된 원통이 있고, 그 위에 평평한 천 메쉬가 생성됨.

물성 설정: 사용자는 UI(Tweakpane)를 통해 천의 무게, 부드러움(Stiffness), 마찰력 등을 조절함.

시뮬레이션 실행: 'Start' 버튼을 누르면 천이 중력에 의해 낙하하며 원통과 충돌함.

결과 관찰: 천이 원통의 곡면을 따라 자연스럽게 흘러내리고 주름지는 모습을 360도 회전하며 관찰.

재시도: 'Reset' 버튼으로 천을 원래 위치로 되돌리고 파라미터를 수정하여 다시 시뮬레이션.

1. 사용자 인터페이스(UI) 요구사항

3D Viewport: Three.js 기반의 전체 화면 렌더링.

Control Panel (Tweakpane): * Physics: 중력값, 시뮬레이션 속도 조절.

Cloth Material: Stiffness(강성), Damping(감쇠), Friction(마찰).

Visuals: 와이어프레임 모드 온/오프, 천 색상 변경.

Actions: Simulation Start, Reset.
