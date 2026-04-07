import { useState, useMemo } from 'react';
import { cn } from '@/ui/lib/utils';
import { useAuthStore } from '@/ui/store/useAuthStore';
import { useSettingsStore } from '@/ui/store/useSettingsStore';
import claudeIcon from '@/ui/assets/avatars/claude.png';
import openaiIcon from '@/ui/assets/avatars/openai.png';

// Fluent Emoji 3D — 表情
import emojiGrinning from '@/ui/assets/avatars/emoji/grinning.png';
import emojiWinking from '@/ui/assets/avatars/emoji/winking.png';
import emojiSunglasses from '@/ui/assets/avatars/emoji/sunglasses.png';
import emojiStarStruck from '@/ui/assets/avatars/emoji/star-struck.png';
import emojiPartying from '@/ui/assets/avatars/emoji/partying.png';
import emojiHorns from '@/ui/assets/avatars/emoji/horns.png';
import emojiJoy from '@/ui/assets/avatars/emoji/joy.png';
import emojiThinking from '@/ui/assets/avatars/emoji/thinking.png';
import emojiShushing from '@/ui/assets/avatars/emoji/shushing.png';
import emojiHearts from '@/ui/assets/avatars/emoji/hearts.png';
import emojiZany from '@/ui/assets/avatars/emoji/zany.png';
import emojiNerd from '@/ui/assets/avatars/emoji/nerd.png';
import emojiClown from '@/ui/assets/avatars/emoji/clown.png';
import emojiHalo from '@/ui/assets/avatars/emoji/halo.png';
import emojiCold from '@/ui/assets/avatars/emoji/cold.png';
import emojiDisguised from '@/ui/assets/avatars/emoji/disguised.png';
import emojiCowboy from '@/ui/assets/avatars/emoji/cowboy.png';

// Fluent Emoji 3D — 动物
import emojiFox from '@/ui/assets/avatars/emoji/fox.png';
import emojiCat from '@/ui/assets/avatars/emoji/cat.png';
import emojiDog from '@/ui/assets/avatars/emoji/dog.png';
import emojiPanda from '@/ui/assets/avatars/emoji/panda.png';
import emojiLion from '@/ui/assets/avatars/emoji/lion.png';
import emojiFrog from '@/ui/assets/avatars/emoji/frog.png';
import emojiOwl from '@/ui/assets/avatars/emoji/owl.png';
import emojiUnicorn from '@/ui/assets/avatars/emoji/unicorn.png';
import emojiOctopus from '@/ui/assets/avatars/emoji/octopus.png';
import emojiBee from '@/ui/assets/avatars/emoji/bee.png';
import emojiBear from '@/ui/assets/avatars/emoji/bear.png';
import emojiMonkey from '@/ui/assets/avatars/emoji/monkey.png';
import emojiPenguin from '@/ui/assets/avatars/emoji/penguin.png';
import emojiButterfly from '@/ui/assets/avatars/emoji/butterfly.png';
import emojiDolphin from '@/ui/assets/avatars/emoji/dolphin.png';
import emojiWhale from '@/ui/assets/avatars/emoji/whale.png';
import emojiDragon from '@/ui/assets/avatars/emoji/dragon.png';
import emojiChick from '@/ui/assets/avatars/emoji/chick.png';
import emojiRabbit from '@/ui/assets/avatars/emoji/rabbit.png';
import emojiTurtle from '@/ui/assets/avatars/emoji/turtle.png';

// Fluent Emoji 3D — 自然/物品
import emojiBlossom from '@/ui/assets/avatars/emoji/blossom.png';
import emojiFire from '@/ui/assets/avatars/emoji/fire.png';
import emojiLightning from '@/ui/assets/avatars/emoji/lightning.png';
import emojiRainbow from '@/ui/assets/avatars/emoji/rainbow.png';
import emojiGem from '@/ui/assets/avatars/emoji/gem.png';
import emojiGamepad from '@/ui/assets/avatars/emoji/gamepad.png';
import emojiBullseye from '@/ui/assets/avatars/emoji/bullseye.png';
import emojiRocket from '@/ui/assets/avatars/emoji/rocket.png';
import emojiPalette from '@/ui/assets/avatars/emoji/palette.png';
import emojiMusic from '@/ui/assets/avatars/emoji/music.png';
import emojiGhost from '@/ui/assets/avatars/emoji/ghost.png';
import emojiRobot from '@/ui/assets/avatars/emoji/robot.png';
import emojiAlien from '@/ui/assets/avatars/emoji/alien.png';
import emojiStar from '@/ui/assets/avatars/emoji/star.png';
import emojiCrown from '@/ui/assets/avatars/emoji/crown.png';
import emojiCrystal from '@/ui/assets/avatars/emoji/crystal.png';
import emojiMushroom from '@/ui/assets/avatars/emoji/mushroom.png';
import emojiClover from '@/ui/assets/avatars/emoji/clover.png';
import emojiSnowflake from '@/ui/assets/avatars/emoji/snowflake.png';
import emojiSeedling from '@/ui/assets/avatars/emoji/seedling.png';
import emojiSun from '@/ui/assets/avatars/emoji/sun.png';
import emojiMoon from '@/ui/assets/avatars/emoji/moon.png';
import emojiGlowstar from '@/ui/assets/avatars/emoji/glowstar.png';

// Fluent Emoji 3D — 食物
import emojiPizza from '@/ui/assets/avatars/emoji/pizza.png';
import emojiCake from '@/ui/assets/avatars/emoji/cake.png';
import emojiCookie from '@/ui/assets/avatars/emoji/cookie.png';
import emojiCherry from '@/ui/assets/avatars/emoji/cherry.png';
import emojiWatermelon from '@/ui/assets/avatars/emoji/watermelon.png';
import emojiCoffee from '@/ui/assets/avatars/emoji/coffee.png';

// Fluent Emoji 3D — 物品
import emojiHeart from '@/ui/assets/avatars/emoji/heart.png';
import emojiGlobe from '@/ui/assets/avatars/emoji/globe.png';
import emojiCamera from '@/ui/assets/avatars/emoji/camera.png';
import emojiBook from '@/ui/assets/avatars/emoji/book.png';
import emojiGift from '@/ui/assets/avatars/emoji/gift.png';
import emojiBalloon from '@/ui/assets/avatars/emoji/balloon.png';
import emojiDice from '@/ui/assets/avatars/emoji/dice.png';
import emojiTrophy from '@/ui/assets/avatars/emoji/trophy.png';

// Fluent Emoji 3D — 面部/手势
import emojiTongue from '@/ui/assets/avatars/emoji/tongue.png';
import emojiSleepy from '@/ui/assets/avatars/emoji/sleepy.png';
import emojiAngry from '@/ui/assets/avatars/emoji/angry.png';
import emojiScream from '@/ui/assets/avatars/emoji/scream.png';
import emojiPleading from '@/ui/assets/avatars/emoji/pleading.png';
import emojiSalute from '@/ui/assets/avatars/emoji/salute.png';
import emojiWave from '@/ui/assets/avatars/emoji/wave.png';
import emojiThumbsup from '@/ui/assets/avatars/emoji/thumbsup.png';

// Fluent Emoji 3D — 更多动物
import emojiShark from '@/ui/assets/avatars/emoji/shark.png';
import emojiSpider from '@/ui/assets/avatars/emoji/spider.png';
import emojiCrab from '@/ui/assets/avatars/emoji/crab.png';
import emojiSnail from '@/ui/assets/avatars/emoji/snail.png';
import emojiPeacock from '@/ui/assets/avatars/emoji/peacock.png';
import emojiFlamingo from '@/ui/assets/avatars/emoji/flamingo.png';
import emojiParrot from '@/ui/assets/avatars/emoji/parrot.png';
import emojiHedgehog from '@/ui/assets/avatars/emoji/hedgehog.png';

/**
 * Avatar 类型
 */
export type AvatarType = 'user' | 'ai' | 'system';

/**
 * 预设头像项
 */
export interface PresetAvatar {
  id: string;
  src: string;
  label: string;
}

/**
 * Avatar 组件属性
 */
export interface ChatAvatarProps {
  type: AvatarType;
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  provider?: 'claude' | 'codex' | string;
  className?: string;
}

/** 默认用户头像 ID */
export const DEFAULT_USER_AVATAR = 'grinning';

/**
 * Fluent Emoji 3D 预设头像列表（90个）
 */
export const PRESET_AVATARS: PresetAvatar[] = [
  // 表情 (25)
  { id: 'grinning', src: emojiGrinning, label: '😀' },
  { id: 'winking', src: emojiWinking, label: '😉' },
  { id: 'sunglasses', src: emojiSunglasses, label: '😎' },
  { id: 'star-struck', src: emojiStarStruck, label: '🤩' },
  { id: 'partying', src: emojiPartying, label: '🥳' },
  { id: 'joy', src: emojiJoy, label: '😂' },
  { id: 'hearts', src: emojiHearts, label: '🥰' },
  { id: 'thinking', src: emojiThinking, label: '🤔' },
  { id: 'shushing', src: emojiShushing, label: '🤫' },
  { id: 'zany', src: emojiZany, label: '🤪' },
  { id: 'nerd', src: emojiNerd, label: '🤓' },
  { id: 'halo', src: emojiHalo, label: '😇' },
  { id: 'horns', src: emojiHorns, label: '😈' },
  { id: 'cold', src: emojiCold, label: '🥶' },
  { id: 'clown', src: emojiClown, label: '🤡' },
  { id: 'disguised', src: emojiDisguised, label: '🥸' },
  { id: 'cowboy', src: emojiCowboy, label: '🤠' },
  { id: 'tongue', src: emojiTongue, label: '😛' },
  { id: 'sleepy', src: emojiSleepy, label: '😴' },
  { id: 'angry', src: emojiAngry, label: '😡' },
  { id: 'scream', src: emojiScream, label: '😱' },
  { id: 'pleading', src: emojiPleading, label: '🥺' },
  { id: 'salute', src: emojiSalute, label: '🫡' },
  { id: 'wave', src: emojiWave, label: '👋' },
  { id: 'thumbsup', src: emojiThumbsup, label: '👍' },
  // 动物 (24)
  { id: 'fox', src: emojiFox, label: '🦊' },
  { id: 'cat', src: emojiCat, label: '🐱' },
  { id: 'dog', src: emojiDog, label: '🐶' },
  { id: 'panda', src: emojiPanda, label: '🐼' },
  { id: 'lion', src: emojiLion, label: '🦁' },
  { id: 'bear', src: emojiBear, label: '🐻' },
  { id: 'monkey', src: emojiMonkey, label: '🐵' },
  { id: 'frog', src: emojiFrog, label: '🐸' },
  { id: 'owl', src: emojiOwl, label: '🦉' },
  { id: 'unicorn', src: emojiUnicorn, label: '🦄' },
  { id: 'penguin', src: emojiPenguin, label: '🐧' },
  { id: 'rabbit', src: emojiRabbit, label: '🐰' },
  { id: 'chick', src: emojiChick, label: '🐣' },
  { id: 'dolphin', src: emojiDolphin, label: '🐬' },
  { id: 'dragon', src: emojiDragon, label: '🐲' },
  { id: 'turtle', src: emojiTurtle, label: '🐢' },
  { id: 'octopus', src: emojiOctopus, label: '🐙' },
  { id: 'whale', src: emojiWhale, label: '🐳' },
  { id: 'bee', src: emojiBee, label: '🐝' },
  { id: 'butterfly', src: emojiButterfly, label: '🦋' },
  { id: 'shark', src: emojiShark, label: '🦈' },
  { id: 'spider', src: emojiSpider, label: '🕷️' },
  { id: 'crab', src: emojiCrab, label: '🦀' },
  { id: 'snail', src: emojiSnail, label: '🐌' },
  { id: 'peacock', src: emojiPeacock, label: '🦚' },
  { id: 'flamingo', src: emojiFlamingo, label: '🦩' },
  { id: 'parrot', src: emojiParrot, label: '🦜' },
  { id: 'hedgehog', src: emojiHedgehog, label: '🦔' },
  // 自然 (10)
  { id: 'blossom', src: emojiBlossom, label: '🌸' },
  { id: 'fire', src: emojiFire, label: '🔥' },
  { id: 'lightning', src: emojiLightning, label: '⚡' },
  { id: 'rainbow', src: emojiRainbow, label: '🌈' },
  { id: 'snowflake', src: emojiSnowflake, label: '❄️' },
  { id: 'seedling', src: emojiSeedling, label: '🌱' },
  { id: 'mushroom', src: emojiMushroom, label: '🍄' },
  { id: 'clover', src: emojiClover, label: '🍀' },
  { id: 'sun', src: emojiSun, label: '🌞' },
  { id: 'moon', src: emojiMoon, label: '🌙' },
  // 食物 (6)
  { id: 'pizza', src: emojiPizza, label: '🍕' },
  { id: 'cake', src: emojiCake, label: '🎂' },
  { id: 'cookie', src: emojiCookie, label: '🍪' },
  { id: 'cherry', src: emojiCherry, label: '🍒' },
  { id: 'watermelon', src: emojiWatermelon, label: '🍉' },
  { id: 'coffee', src: emojiCoffee, label: '☕' },
  // 物品/符号 (21)
  { id: 'star', src: emojiStar, label: '⭐' },
  { id: 'glowstar', src: emojiGlowstar, label: '🌟' },
  { id: 'gem', src: emojiGem, label: '💎' },
  { id: 'crown', src: emojiCrown, label: '👑' },
  { id: 'crystal', src: emojiCrystal, label: '🔮' },
  { id: 'rocket', src: emojiRocket, label: '🚀' },
  { id: 'gamepad', src: emojiGamepad, label: '🎮' },
  { id: 'bullseye', src: emojiBullseye, label: '🎯' },
  { id: 'palette', src: emojiPalette, label: '🎨' },
  { id: 'music', src: emojiMusic, label: '🎵' },
  { id: 'ghost', src: emojiGhost, label: '👻' },
  { id: 'robot', src: emojiRobot, label: '🤖' },
  { id: 'alien', src: emojiAlien, label: '👽' },
  { id: 'heart', src: emojiHeart, label: '❤️' },
  { id: 'globe', src: emojiGlobe, label: '🌍' },
  { id: 'camera', src: emojiCamera, label: '📷' },
  { id: 'book', src: emojiBook, label: '📚' },
  { id: 'gift', src: emojiGift, label: '🎁' },
  { id: 'balloon', src: emojiBalloon, label: '🎈' },
  { id: 'dice', src: emojiDice, label: '🎲' },
  { id: 'trophy', src: emojiTrophy, label: '🏆' },
];

/**
 * 通过 ID 查找预设头像的图片 src
 */
function getPresetAvatarSrc(avatarId: string): string | null {
  const preset = PRESET_AVATARS.find((a) => a.id === avatarId);
  return preset?.src ?? null;
}

/**
 * 尺寸配置 — 聊天区头像加大
 */
const SIZE_CONFIG = {
  sm: {
    container: 'h-8 w-8',
    text: 'text-xs',
    icon: 'h-4 w-4',
    avatarImg: 'h-6 w-6',
    providerImg: 'h-5 w-5',
  },
  md: {
    container: 'h-10 w-10',
    text: 'text-sm',
    icon: 'h-5 w-5',
    avatarImg: 'h-8 w-8',
    providerImg: 'h-7 w-7',
  },
  lg: {
    container: 'h-12 w-12',
    text: 'text-base',
    icon: 'h-6 w-6',
    avatarImg: 'h-9 w-9',
    providerImg: 'h-8 w-8',
  },
};

/**
 * 系统图标
 */
function SystemIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * 用户图标
 */
function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/**
 * 加载动画
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

/**
 * 获取用户名首字母
 */
function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

/**
 * 获取 AI provider 对应的图标
 */
function getProviderIcon(provider?: string): string {
  if (!provider) return claudeIcon;
  const p = provider.toLowerCase();
  if (p.includes('codex') || p.includes('openai') || p.includes('gpt')) {
    return openaiIcon;
  }
  return claudeIcon;
}

/**
 * 聊天头像组件
 * 支持用户头像（Fluent Emoji / URL / 首字母）、AI 头像（provider 图标）和系统头像
 * hover 时有水珠高光效果
 */
export function ChatAvatar({
  type,
  src,
  alt,
  size = 'md',
  isLoading = false,
  provider,
  className,
}: ChatAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const user = useAuthStore((s) => s.user);
  const userAvatar = useSettingsStore((s) => s.userAvatar);

  // 如果用户没有设置过头像，使用默认笑脸
  const effectiveUserAvatar = userAvatar || DEFAULT_USER_AVATAR;

  const sizeConfig = SIZE_CONFIG[size];

  const imageSrc = useMemo(() => {
    if (type === 'user') {
      return src ?? user?.avatar;
    }
    return src;
  }, [type, src, user?.avatar]);

  const altText = useMemo(() => {
    if (alt) return alt;
    if (type === 'ai') {
      const p = provider?.toLowerCase();
      if (p?.includes('codex') || p?.includes('openai') || p?.includes('gpt')) return 'OpenAI';
      return 'Claude AI';
    }
    if (type === 'system') return 'System';
    return user?.name ?? user?.email ?? 'User';
  }, [alt, type, user?.name, user?.email, provider]);

  const initials = useMemo(() => {
    if (type !== 'user') return '';
    return getInitials(user?.name, user?.email);
  }, [type, user?.name, user?.email]);

  const handleImageError = () => {
    setHasError(true);
  };

  const renderContent = () => {
    if (isLoading) {
      return <LoadingSpinner className={cn(sizeConfig.icon, 'text-muted')} />;
    }

    // AI 头像
    if (type === 'ai') {
      const isOpenAI = provider && /codex|openai|gpt/i.test(provider);
      return (
        <img
          src={getProviderIcon(provider)}
          alt={altText}
          className={cn(sizeConfig.providerImg, 'object-contain', isOpenAI && 'dark:invert')}
        />
      );
    }

    // 系统头像
    if (type === 'system') {
      return <SystemIcon className={cn(sizeConfig.icon, 'text-muted')} />;
    }

    // 用户头像 — 优先级：Fluent Emoji 预设 > URL 图片 > 首字母 > 默认图标
    const presetSrc = getPresetAvatarSrc(effectiveUserAvatar);
    if (presetSrc) {
      return (
        <img
          src={presetSrc}
          alt={effectiveUserAvatar}
          className={cn(sizeConfig.avatarImg, 'object-contain')}
        />
      );
    }

    if (imageSrc && !hasError) {
      return (
        <img
          src={imageSrc}
          alt={altText}
          className="h-full w-full object-cover"
          onError={handleImageError}
        />
      );
    }

    if (initials) {
      return (
        <span className={cn(sizeConfig.text, 'font-medium text-accent')}>{initials}</span>
      );
    }

    return <UserIcon className={cn(sizeConfig.icon, 'text-muted')} />;
  };

  const containerClassName = cn(
    'group/avatar relative flex items-center justify-center rounded-full overflow-hidden',
    'transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-default',
    sizeConfig.container,
    (type === 'ai' || type === 'system' || isLoading) && 'bg-surface-secondary',
    type === 'user' && 'bg-accent/10',
    type === 'user' && imageSrc && !hasError && !effectiveUserAvatar && 'ring-1 ring-ink-900/10',
    // AI hover: warm accent glow ring + spring scale
    type === 'ai' && 'hover:scale-110 hover:shadow-[0_0_0_2.5px_var(--color-accent-muted),0_0_20px_var(--color-accent-subtle)]',
    // User hover: gentle lift + depth shadow + thin accent ring
    type === 'user' && 'hover:scale-[1.08] hover:-translate-y-px hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.1),0_0_0_2px_var(--color-accent-subtle)]',
    // System hover: subtle scale
    type === 'system' && 'hover:scale-105',
    className
  );

  return (
    <div className={containerClassName} title={altText} role="img" aria-label={altText}>
      {renderContent()}
      {/* Hover 内光效果 — 类似工作室顶光，替代旧的水珠高光 */}
      <div
        className={cn(
          'absolute inset-0 rounded-full pointer-events-none transition-opacity duration-300',
          'opacity-0 group-hover/avatar:opacity-100',
          type === 'ai' && 'bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.3)_0%,transparent_65%)]',
          type === 'user' && 'bg-[radial-gradient(circle_at_35%_15%,rgba(255,255,255,0.25)_0%,transparent_55%)]',
          type === 'system' && 'bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.15)_0%,transparent_50%)]',
        )}
      />
    </div>
  );
}

export default ChatAvatar;
