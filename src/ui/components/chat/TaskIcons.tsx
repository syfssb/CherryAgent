import {
  // 分类图标
  Star,
  Folder,
  BarChart,
  PenTool,
  DollarSign,
  Search,
  Users,
  Home,
  Zap,
  // 任务图标
  FolderOpen,
  FileImage,
  Trash2,
  Receipt,
  Database,
  Merge,
  Globe,
  Mic,
  Video,
  FileText,
  Share2,
  PieChart,
  Calculator,
  TrendingUp,
  MessageSquare,
  BookOpen,
  Languages,
  FolderTree,
  Calendar,
  Mail,
  Utensils,
  MapPin,
  Activity,
  // 保留原有图标
  Target,
  Book,
  RefreshCw,
  Beaker,
  Lightbulb
} from 'lucide-react';

interface IconProps {
  className?: string;
}

// 分类图标组件
export function StarIcon({ className = "h-6 w-6" }: IconProps) {
  return <Star className={className} />;
}

export function FolderIcon({ className = "h-6 w-6" }: IconProps) {
  return <Folder className={className} />;
}

export function BarChartIcon({ className = "h-6 w-6" }: IconProps) {
  return <BarChart className={className} />;
}

export function PenToolIcon({ className = "h-6 w-6" }: IconProps) {
  return <PenTool className={className} />;
}

export function DollarSignIcon({ className = "h-6 w-6" }: IconProps) {
  return <DollarSign className={className} />;
}

export function SearchIcon({ className = "h-6 w-6" }: IconProps) {
  return <Search className={className} />;
}

export function UsersIcon({ className = "h-6 w-6" }: IconProps) {
  return <Users className={className} />;
}

export function HomeIcon({ className = "h-6 w-6" }: IconProps) {
  return <Home className={className} />;
}

export function ZapIcon({ className = "h-6 w-6" }: IconProps) {
  return <Zap className={className} />;
}

// 任务图标组件
export function FolderOpenIcon({ className = "h-6 w-6" }: IconProps) {
  return <FolderOpen className={className} />;
}

export function FileImageIcon({ className = "h-6 w-6" }: IconProps) {
  return <FileImage className={className} />;
}

export function Trash2Icon({ className = "h-6 w-6" }: IconProps) {
  return <Trash2 className={className} />;
}

export function ReceiptIcon({ className = "h-6 w-6" }: IconProps) {
  return <Receipt className={className} />;
}

export function DatabaseIcon({ className = "h-6 w-6" }: IconProps) {
  return <Database className={className} />;
}

export function MergeIcon({ className = "h-6 w-6" }: IconProps) {
  return <Merge className={className} />;
}

export function GlobeIcon({ className = "h-6 w-6" }: IconProps) {
  return <Globe className={className} />;
}

export function MicIcon({ className = "h-6 w-6" }: IconProps) {
  return <Mic className={className} />;
}

export function VideoIcon({ className = "h-6 w-6" }: IconProps) {
  return <Video className={className} />;
}

export function FileTextIcon({ className = "h-6 w-6" }: IconProps) {
  return <FileText className={className} />;
}

export function Share2Icon({ className = "h-6 w-6" }: IconProps) {
  return <Share2 className={className} />;
}

export function PieChartIcon({ className = "h-6 w-6" }: IconProps) {
  return <PieChart className={className} />;
}

export function CalculatorIcon({ className = "h-6 w-6" }: IconProps) {
  return <Calculator className={className} />;
}

export function TrendingUpIcon({ className = "h-6 w-6" }: IconProps) {
  return <TrendingUp className={className} />;
}

export function MessageSquareIcon({ className = "h-6 w-6" }: IconProps) {
  return <MessageSquare className={className} />;
}

export function BookOpenIcon({ className = "h-6 w-6" }: IconProps) {
  return <BookOpen className={className} />;
}

export function LanguagesIcon({ className = "h-6 w-6" }: IconProps) {
  return <Languages className={className} />;
}

export function FolderTreeIcon({ className = "h-6 w-6" }: IconProps) {
  return <FolderTree className={className} />;
}

export function CalendarIcon({ className = "h-6 w-6" }: IconProps) {
  return <Calendar className={className} />;
}

export function MailIcon({ className = "h-6 w-6" }: IconProps) {
  return <Mail className={className} />;
}

export function UtensilsIcon({ className = "h-6 w-6" }: IconProps) {
  return <Utensils className={className} />;
}

export function MapPinIcon({ className = "h-6 w-6" }: IconProps) {
  return <MapPin className={className} />;
}

export function ActivityIcon({ className = "h-6 w-6" }: IconProps) {
  return <Activity className={className} />;
}

// PDF 转 Word - 文档转换图标
export function DocumentConvertIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="M9 15l3 3 3-3" />
    </svg>
  );
}

// 保留原有的自定义图标组件
export function ChartBarIcon({ className = "h-6 w-6" }: IconProps) {
  return <BarChart className={className} />;
}

export function PresentationIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M7 8h6" />
      <path d="M7 12h10" />
    </svg>
  );
}

export function EditIcon({ className = "h-6 w-6" }: IconProps) {
  return <PenTool className={className} />;
}

export function TargetIcon({ className = "h-6 w-6" }: IconProps) {
  return <Target className={className} />;
}

export function BookIcon({ className = "h-6 w-6" }: IconProps) {
  return <Book className={className} />;
}

export function RefreshIcon({ className = "h-6 w-6" }: IconProps) {
  return <RefreshCw className={className} />;
}

export function BeakerIcon({ className = "h-6 w-6" }: IconProps) {
  return <Beaker className={className} />;
}

export function LightbulbIcon({ className = "h-6 w-6" }: IconProps) {
  return <Lightbulb className={className} />;
}

// 分类图标映射
export const CategoryIconMap = {
  "all": StarIcon,
  "preset-skills": ZapIcon,
  "file-management": FolderIcon,
  "data-processing": BarChartIcon,
  "content-creation": PenToolIcon,
  "financial-management": DollarSignIcon,
  "learning-research": SearchIcon,
  "work-collaboration": UsersIcon,
  "personal-life": HomeIcon,
} as const;

// 任务图标映射对象 - 为每个任务分配独特图标
export const TaskIconMap = {
  // 保留原有图标
  "pdf-to-word": DocumentConvertIcon,
  "excel-analysis": ChartBarIcon,
  "ppt-create": PresentationIcon,
  "write-article": EditIcon,
  "translate": GlobeIcon,
  "polish-text": TargetIcon,
  "extract-info": SearchIcon,
  "summarize": BookIcon,
  "batch-process": RefreshIcon,
  "email-template": MailIcon,
  "research": BeakerIcon,
  "explain": LightbulbIcon,

  // 新增任务图标 - 文件管理类
  "organize-downloads": FolderOpenIcon,
  "batch-rename": FileImageIcon,
  "duplicate-cleaner": Trash2Icon,

  // 数据处理类
  "invoice-processing": ReceiptIcon,
  "data-cleaning": DatabaseIcon,
  "csv-merger": MergeIcon,
  "web-scraping": GlobeIcon,

  // 内容创作类
  "meeting-minutes": MicIcon,
  "video-editing": VideoIcon,
  "blog-writing": FileTextIcon,
  "social-media": Share2Icon,

  // 财务管理类
  "expense-tracking": PieChartIcon,
  "tax-calculation": CalculatorIcon,
  "investment-analysis": TrendingUpIcon,

  // 学习研究类
  "feedback-analysis": MessageSquareIcon,
  "research-summary": BookOpenIcon,
  "language-learning": LanguagesIcon,

  // 工作协作类
  "doc-organization": FolderTreeIcon,
  "project-planning": CalendarIcon,
  "email-automation": MailIcon,

  // 个人生活类
  "meal-planning": UtensilsIcon,
  "travel-planning": MapPinIcon,
  "health-tracking": ActivityIcon,
} as const;

export type CategoryIconId = keyof typeof CategoryIconMap;
export type TaskIconId = keyof typeof TaskIconMap;
