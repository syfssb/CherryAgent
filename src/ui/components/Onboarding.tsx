import { useOnboardingTour } from './onboarding/useOnboardingTour';

/**
 * 新手引导组件
 * 使用 driver.js 实现实时界面引导，高亮实际 UI 元素并在旁边展示说明
 * 首次使用时自动启动，也可通过设置页面手动重新触发
 */
export function Onboarding() {
  useOnboardingTour();
  return null;
}

export { resetOnboarding } from './onboarding/useOnboardingTour';
export default Onboarding;
