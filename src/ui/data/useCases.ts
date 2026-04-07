// Cherry Agent 使用案例数据
// 从 Cowork使用案例集.md 提取的22个真实使用案例

export interface UseCase {
  id: string;
  title: string;
  description: string;
  originalTime: string;
  optimizedTime: string;
  scale: string;
  capabilities: string[];
  category: UseCaseCategory;
  skills?: string[];
  promptTemplate: string;
}

export type UseCaseCategory =
  | '文件管理'
  | '数据处理'
  | '内容创作'
  | '财务管理'
  | '学习研究'
  | '工作协作'
  | '个人生活';

export interface UseCaseGroup {
  category: UseCaseCategory;
  cases: UseCase[];
}

// 使用案例数据
export const useCases: UseCaseGroup[] = [
  // 文件管理场景
  {
    category: '文件管理',
    cases: [
      {
        id: 'file-management-1',
        title: '清理混乱的下载文件夹',
        description: '自动整理500+个文件，按类型分类、重命名、标记重复文件，从2-3小时缩短到5分钟',
        originalTime: '2-3小时',
        optimizedTime: '5分钟',
        scale: '500+个文件',
        capabilities: ['自动分类', '文件重命名', '重复检测', '临时文件识别'],
        category: '文件管理',
        promptTemplate: `帮我整理下载文件夹。扫描所有文件并提出计划：
- 按类型创建文件夹（文档、图片、视频、音频、压缩包等）
- 按日期重命名文件（格式：YYYY-MM-DD_原文件名）
- 标记重复文件
- 列出可以删除的临时文件
先展示计划，等我批准后再执行。`
      },
      {
        id: 'file-management-2',
        title: '整理项目文档',
        description: '分类整理120+个项目文档，自动生成索引和摘要，标记需要更新的文档',
        originalTime: '2-3小时',
        optimizedTime: '30分钟',
        scale: '120+个文档',
        capabilities: ['文档分类', '自动摘要', '索引生成', '状态标记'],
        category: '文件管理',
        promptTemplate: `整理 {项目文件夹} 文件夹：
1. 按文档类型分类（需求文档、设计文档、会议记录、报告等）
2. 按时间顺序排列
3. 创建一个索引文件，列出所有文档及其摘要
4. 标记过期或需要更新的文档`
      },
      {
        id: 'file-management-3',
        title: '照片库整理',
        description: '整理5000+张照片，按日期和事件分类，识别并删除模糊重复照片',
        originalTime: '5-6小时',
        optimizedTime: '1小时',
        scale: '5000+张照片',
        capabilities: ['图像识别', '日期提取', '事件分类', '重复检测', '模糊检测'],
        category: '文件管理',
        promptTemplate: `整理我的照片库 {照片文件夹}：
- 按拍摄日期创建年份和月份文件夹
- 识别并删除模糊或重复的照片
- 按事件分类（旅行、家庭、活动等）
- 重命名照片为有意义的名称`
      }
    ]
  },
  // 数据处理场景
  {
    category: '数据处理',
    cases: [
      {
        id: 'data-processing-1',
        title: '收据管理与报销',
        description: '处理45张收据照片，自动提取关键信息，生成Excel表格和报销报告，准确率95%+',
        originalTime: '半天时间',
        optimizedTime: '10分钟',
        scale: '45张收据照片',
        capabilities: ['OCR识别', '信息提取', '数据分类', 'Excel生成', '报告生成'],
        category: '数据处理',
        skills: ['xlsx'],
        promptTemplate: `处理 {收据文件夹} 文件夹中的收据照片：
1. 识别每张收据的日期、商家、金额、类别
2. 创建 Excel 表格，包含所有收据信息
3. 按类别汇总金额（餐饮、交通、住宿、其他）
4. 生成月度报销报告`
      },
      {
        id: 'data-processing-2',
        title: '客户信息整理',
        description: '整合5个Excel文件的客户数据，合并重复记录，标准化200+条客户信息',
        originalTime: '2-3小时',
        optimizedTime: '30分钟',
        scale: '5个Excel文件，200+条客户信息',
        capabilities: ['数据整合', '重复检测', '格式标准化', '分类管理'],
        category: '数据处理',
        skills: ['xlsx'],
        promptTemplate: `整合客户信息：
- 从多个 Excel 文件中提取客户数据
- 合并重复客户记录
- 标准化电话号码和邮箱格式
- 按地区和行业分类
- 生成客户数据库 Excel 文件`
      },
      {
        id: 'data-processing-3',
        title: '数据清洗与分析',
        description: '清洗10,000+条销售记录，删除重复记录，生成销售分析报告，从2天缩短到30分钟',
        originalTime: '2天',
        optimizedTime: '30分钟',
        scale: '10,000+条销售记录',
        capabilities: ['数据清洗', '重复检测', '缺失值处理', '趋势分析', '报告生成'],
        category: '数据处理',
        skills: ['xlsx'],
        promptTemplate: `清洗销售数据 {数据文件}：
1. 删除重复记录
2. 填充缺失值
3. 标准化日期格式
4. 按产品类别和地区汇总销售额
5. 生成月度销售趋势报告`
      }
    ]
  },
  // 内容创作场景
  {
    category: '内容创作',
    cases: [
      {
        id: 'content-creation-1',
        title: '会议记录整理',
        description: '整理5场会议记录，提取28个行动项，按负责人分类，从2小时缩短到15分钟',
        originalTime: '2小时',
        optimizedTime: '15分钟',
        scale: '5场会议记录，28个行动项',
        capabilities: ['信息提取', '任务识别', '责任分配', '时间管理'],
        category: '内容创作',
        promptTemplate: `整理本周的会议记录：
- 从 {会议记录数量} 个会议记录文件中提取关键信息
- 汇总所有行动项（Action Items）
- 按负责人分类
- 标记截止日期
- 生成周度会议摘要`
      },
      {
        id: 'content-creation-2',
        title: '博客文章准备',
        description: '整理23篇参考文章，提取核心观点，生成文章大纲，从3小时缩短到30分钟',
        originalTime: '3小时',
        optimizedTime: '30分钟',
        scale: '23篇参考文章',
        capabilities: ['内容分析', '观点提取', '结构化整理', '大纲生成'],
        category: '内容创作',
        promptTemplate: `准备博客文章：
- 整理 {研究文件夹} 文件夹中的参考文章
- 提取每篇文章的核心观点
- 按主题分类
- 生成文章大纲
- 列出需要引用的来源`
      },
      {
        id: 'content-creation-3',
        title: '社交媒体内容规划',
        description: '分析90天内容数据，识别高表现内容类型，生成30天内容日历和50+创意',
        originalTime: '1天',
        optimizedTime: '2小时',
        scale: '90天内容数据，30天内容日历',
        capabilities: ['数据分析', '模式识别', '内容规划', '创意生成'],
        category: '内容创作',
        promptTemplate: `规划下月社交媒体内容：
- 分析过去 3 个月的内容表现数据
- 识别高表现内容的共同特点
- 生成下月内容日历
- 为每个内容主题提供创意建议`
      }
    ]
  },
  // 财务管理场景
  {
    category: '财务管理',
    cases: [
      {
        id: 'financial-management-1',
        title: '个人财务记账',
        description: '从银行对账单提取120+条交易记录，自动分类支出，生成财务报告',
        originalTime: '2-3小时',
        optimizedTime: '30分钟',
        scale: '120+条交易记录',
        capabilities: ['PDF解析', '交易分类', '财务分析', '异常检测'],
        category: '财务管理',
        skills: ['pdf'],
        promptTemplate: `整理本月财务记录：
- 从银行对账单 PDF 中提取交易记录
- 分类支出（生活、工作、娱乐等）
- 计算各类别支出占比
- 生成月度财务报告
- 对比上月支出，标记异常项`
      },
      {
        id: 'financial-management-2',
        title: '发票管理',
        description: '处理80张发票PDF，创建跟踪系统，识别逾期发票，生成应收账款报告',
        originalTime: '3-4小时',
        optimizedTime: '45分钟',
        scale: '80张发票',
        capabilities: ['PDF解析', '信息提取', '状态跟踪', '报告生成'],
        category: '财务管理',
        skills: ['pdf', 'xlsx'],
        promptTemplate: `管理客户发票：
- 整理 {发票文件夹} 文件夹中的所有发票 PDF
- 提取发票号、客户名、金额、日期、付款状态
- 创建发票跟踪表格
- 标记逾期未付款的发票
- 生成应收账款报告`
      },
      {
        id: 'financial-management-3',
        title: '预算规划',
        description: '分析12个月支出数据，计算各类别平均支出，制定预算计划和跟踪工具',
        originalTime: '4-5小时',
        optimizedTime: '1小时',
        scale: '12个月支出数据',
        capabilities: ['数据分析', '预算规划', '支出预测', '跟踪工具'],
        category: '财务管理',
        skills: ['xlsx'],
        promptTemplate: `规划家庭年度预算：
- 分析过去一年的支出数据
- 按类别计算平均月支出
- 根据收入制定预算计划
- 设置各类别支出上限
- 生成预算跟踪表格`
      }
    ]
  },
  // 学习研究场景
  {
    category: '学习研究',
    cases: [
      {
        id: 'learning-research-1',
        title: '学习笔记整理',
        description: '整理15门课程笔记，创建知识体系，提取200+关键概念，生成复习大纲',
        originalTime: '6-8小时',
        optimizedTime: '1.5小时',
        scale: '15门课程笔记，200+关键概念',
        capabilities: ['内容整理', '知识提取', '结构化组织', '索引生成'],
        category: '学习研究',
        promptTemplate: `整理本学期的学习笔记：
- 合并 {课程数量} 个课程笔记文件
- 按章节和主题重新组织
- 提取重点和关键概念
- 创建知识点索引
- 生成复习大纲`
      },
      {
        id: 'learning-research-2',
        title: '研究资料管理',
        description: '整理52篇参考文献，提取关键信息，创建文献综述框架和引用列表',
        originalTime: '1周',
        optimizedTime: '1天',
        scale: '52篇参考文献',
        capabilities: ['文献分析', '信息提取', '分类整理', '引用格式化'],
        category: '学习研究',
        skills: ['pdf'],
        promptTemplate: `管理论文研究资料：
- 整理参考文献 PDF
- 提取每篇论文的摘要、方法、结论
- 按研究主题分类
- 创建文献综述框架
- 生成引用列表`
      },
      {
        id: 'learning-research-3',
        title: '在线课程学习管理',
        description: '管理3个课程资料，创建知识点清单，生成学习进度跟踪和每周计划',
        originalTime: '3-4小时',
        optimizedTime: '45分钟',
        scale: '3个课程资料',
        capabilities: ['课程管理', '进度跟踪', '计划制定', '时间管理'],
        category: '学习研究',
        promptTemplate: `管理在线课程学习：
- 整理 {课程数量} 个课程的学习资料
- 提取每个课程的关键知识点
- 创建学习进度跟踪表
- 生成每周学习计划
- 汇总作业和考试时间`
      }
    ]
  },
  // 工作协作场景
  {
    category: '工作协作',
    cases: [
      {
        id: 'work-collaboration-1',
        title: '项目状态报告',
        description: '处理150+任务数据，生成项目周报，计算完成度，从2小时缩短到20分钟',
        originalTime: '2小时',
        optimizedTime: '20分钟',
        scale: '150+任务数据',
        capabilities: ['数据分析', '进度计算', '报告生成', '问题识别'],
        category: '工作协作',
        skills: ['xlsx'],
        promptTemplate: `准备项目周报：
- 从 Jira 导出的 CSV 文件中提取任务数据
- 汇总本周完成的任务
- 列出进行中的任务和阻碍
- 计算项目进度百分比
- 生成可视化的项目状态报告`
      },
      {
        id: 'work-collaboration-2',
        title: '团队文档标准化',
        description: '标准化80+个团队文档，统一格式命名，创建模板和管理指南',
        originalTime: '1天',
        optimizedTime: '2小时',
        scale: '80+个文档',
        capabilities: ['格式标准化', '模板创建', '规范制定', '文档管理'],
        category: '工作协作',
        promptTemplate: `标准化团队文档：
- 检查 {团队文档文件夹} 中的所有文档
- 统一文档格式和命名规范
- 添加缺失的元数据（作者、日期、版本）
- 创建文档模板
- 生成文档管理指南`
      },
      {
        id: 'work-collaboration-3',
        title: '客户反馈分析',
        description: '分析230条客户反馈，识别15个高频问题，生成产品改进路线图，从1周缩短到1天',
        originalTime: '1周',
        optimizedTime: '1天',
        scale: '230条客户反馈',
        capabilities: ['文本分析', '情感分析', '问题分类', '优先级排序'],
        category: '工作协作',
        promptTemplate: `分析客户反馈：
- 整理客户反馈邮件
- 按问题类型分类（功能请求、Bug、使用问题等）
- 提取高频问题
- 按优先级排序
- 生成产品改进建议报告`
      }
    ]
  },
  // 个人生活场景
  {
    category: '个人生活',
    cases: [
      {
        id: 'personal-life-1',
        title: '旅行规划',
        description: '整理30+篇旅行攻略，创建7天详细行程，计算预算，生成旅行清单',
        originalTime: '1天',
        optimizedTime: '2小时',
        scale: '30+篇攻略，7天行程',
        capabilities: ['信息整理', '行程规划', '预算计算', '清单生成'],
        category: '个人生活',
        promptTemplate: `规划{目的地}旅行：
- 整理收集的旅行攻略和景点信息
- 按城市和主题分类
- 创建每日行程安排
- 汇总预算（交通、住宿、餐饮、门票）
- 生成旅行清单（证件、物品、预订确认）`
      },
      {
        id: 'personal-life-2',
        title: '家庭档案管理',
        description: '整理50+个重要文件，创建分类系统，设置到期提醒，生成档案清单',
        originalTime: '半天',
        optimizedTime: '1小时',
        scale: '50+个重要文件',
        capabilities: ['文档分类', '索引管理', '提醒设置', '档案管理'],
        category: '个人生活',
        promptTemplate: `管理家庭档案：
- 整理扫描的重要文件（身份证、户口本、房产证等）
- 按类型分类（身份证件、财产证明、医疗记录等）
- 创建文件索引
- 设置到期提醒（证件有效期）
- 生成家庭档案清单`
      },
      {
        id: 'personal-life-3',
        title: '健康记录管理',
        description: '整理2年健康记录，提取关键指标，创建跟踪系统，识别需要关注的指标',
        originalTime: '3-4小时',
        optimizedTime: '45分钟',
        scale: '2年健康记录',
        capabilities: ['数据提取', '健康分析', '趋势识别', '异常检测'],
        category: '个人生活',
        promptTemplate: `管理健康记录：
- 整理体检报告和医疗记录
- 提取关键健康指标（血压、血糖、体重等）
- 创建健康数据跟踪表
- 标记异常指标
- 生成健康趋势报告`
      },
      {
        id: 'personal-life-4',
        title: '家庭食谱管理',
        description: '整理120个食谱，按菜系分类，提取食材清单，生成每周菜单建议',
        originalTime: '2-3小时',
        optimizedTime: '30分钟',
        scale: '120个食谱',
        capabilities: ['内容分类', '信息提取', '菜单规划', '食材管理'],
        category: '个人生活',
        promptTemplate: `管理家庭食谱：
- 整理收集的食谱（图片、文字、视频链接）
- 按菜系和类型分类（中餐、西餐、甜点等）
- 提取食材清单
- 标记难度和烹饪时间
- 生成每周菜单建议`
      }
    ]
  }
];

// 获取所有案例
export const getAllUseCases = (): UseCase[] => {
  return useCases.flatMap(group => group.cases);
};

// 按分类获取案例
export const getUseCasesByCategory = (category: UseCaseCategory): UseCase[] => {
  const group = useCases.find(g => g.category === category);
  return group ? group.cases : [];
};

// 获取案例统计信息
export const getUseCaseStats = () => {
  const allCases = getAllUseCases();
  return {
    total: allCases.length,
    byCategory: useCases.map(group => ({
      category: group.category,
      count: group.cases.length
    }))
  };
};