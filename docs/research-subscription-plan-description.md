# 期卡介绍功能 - 调研报告

## 展示方式

### 推荐方案：卡片内嵌 + 可展开详情

**设计理念**：
- 简短介绍始终可见（1-2 行）
- 详细内容可展开查看
- 支持 Markdown 富文本
- 亮点标签突出优势

## 数据库设计

```sql
ALTER TABLE subscription_plans
  ADD COLUMN short_description VARCHAR(200),
  ADD COLUMN full_description TEXT,
  ADD COLUMN description_format VARCHAR(20) DEFAULT 'markdown',
  ADD COLUMN highlights JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN terms JSONB DEFAULT '[]'::jsonb;

-- 示例数据
UPDATE subscription_plans SET
  short_description = '适合个人开发者的入门套餐',
  full_description = '## 包含内容\n- 100万 tokens\n- 支持所有模型\n- 30天有效期\n\n## 使用说明\n购买后立即生效，有效期内不限次数使用。',
  highlights = '["性价比高", "灵活使用", "无需订阅"]'::jsonb,
  terms = '["不可退款", "过期自动失效", "不可转让"]'::jsonb
WHERE name = '入门版';
```

## 前端实现

### 桌面端展示
```tsx
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function SubscriptionPlanCard({ plan }: { plan: SubscriptionPlan }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="hover:shadow-lg transition">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-xl font-bold">{plan.name}</h3>
            <p className="text-sm text-gray-600 mt-1">{plan.short_description}</p>
          </div>
          <div className="text-right ml-4">
            <p className="text-3xl font-bold text-blue-600">¥{plan.price}</p>
            <p className="text-sm text-gray-500">{plan.duration}天有效</p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* 亮点标签 */}
        {plan.highlights && plan.highlights.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {plan.highlights.map(h => (
              <span key={h} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                ✨ {h}
              </span>
            ))}
          </div>
        )}

        {/* 可展开的详细介绍 */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
            {isOpen ? '收起详情' : '查看详情'}
            <ChevronDown
              size={16}
              className={cn("transition-transform", isOpen && "rotate-180")}
            />
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 space-y-4">
            <ReactMarkdown className="prose prose-sm max-w-none">
              {plan.full_description}
            </ReactMarkdown>

            {plan.terms && plan.terms.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">使用条款：</p>
                <ul className="space-y-1">
                  {plan.terms.map(t => (
                    <li key={t} className="text-sm text-gray-600 flex items-start">
                      <span className="mr-2">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <button
          className="w-full mt-4 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium"
          onClick={() => handlePurchase(plan.id)}
        >
          立即购买
        </button>
      </CardContent>
    </Card>
  );
}
```

### 期卡列表页
```tsx
export function SubscriptionPlansPage() {
  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: fetchSubscriptionPlans,
  });

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">选择适合你的套餐</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans?.map(plan => (
          <SubscriptionPlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}
```

## 后台管理实现

```tsx
export function PlanDescriptionForm({ planId }: { planId: string }) {
  const [shortDesc, setShortDesc] = useState('');
  const [fullDesc, setFullDesc] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  return (
    <Form onSubmit={handleSubmit}>
      <FormField>
        <Label>简短介绍（显示在卡片上）</Label>
        <Input
          value={shortDesc}
          onChange={(e) => setShortDesc(e.target.value)}
          placeholder="一句话描述期卡特点（最多200字）"
          maxLength={200}
        />
        <p className="text-xs text-gray-500 mt-1">
          {shortDesc.length}/200 字符
        </p>
      </FormField>

      <FormField>
        <Label>完整介绍</Label>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="edit">编辑</TabsTrigger>
            <TabsTrigger value="preview">预览</TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <Textarea
              value={fullDesc}
              onChange={(e) => setFullDesc(e.target.value)}
              placeholder="支持 Markdown 格式，可包含标题、列表、链接等"
              rows={12}
              className="font-mono text-sm"
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="border rounded p-4 min-h-[300px] bg-gray-50">
              <ReactMarkdown className="prose prose-sm max-w-none">
                {fullDesc || '*暂无内容*'}
              </ReactMarkdown>
            </div>
          </TabsContent>
        </Tabs>
      </FormField>

      <FormField>
        <Label>亮点标签</Label>
        <TagInput
          value={highlights}
          onChange={setHighlights}
          placeholder="输入亮点后按回车添加"
        />
        <p className="text-xs text-gray-500 mt-1">
          用于突出期卡的核心优势，建议 2-4 个
        </p>
      </FormField>

      <FormField>
        <Label>使用条款</Label>
        <TagInput
          value={terms}
          onChange={setTerms}
          placeholder="输入条款后按回车添加"
        />
        <p className="text-xs text-gray-500 mt-1">
          重要的使用限制和注意事项
        </p>
      </FormField>

      <div className="flex gap-2">
        <Button type="submit" disabled={!shortDesc}>
          保存
        </Button>
        <Button type="button" variant="outline" onClick={handlePreview}>
          预览效果
        </Button>
      </div>
    </Form>
  );
}
```

## API 接口

```typescript
// GET /api/subscription-plans
export async function getSubscriptionPlans(req: Request, res: Response) {
  const plans = await db.query.subscription_plans.findMany({
    orderBy: [asc(subscription_plans.price)],
  });

  res.json(plans);
}

// PUT /api/admin/subscription-plans/:id/description
export async function updatePlanDescription(req: Request, res: Response) {
  const { id } = req.params;
  const { short_description, full_description, highlights, terms } = req.body;

  // 验证
  if (short_description && short_description.length > 200) {
    return res.status(400).json({ error: '简短介绍不能超过200字符' });
  }

  await db.update(subscription_plans)
    .set({
      short_description,
      full_description,
      highlights,
      terms,
      updated_at: new Date(),
    })
    .where(eq(subscription_plans.id, id));

  res.json({ success: true });
}
```

## 实现建议

1. **使用 shadcn/ui Collapsible**：流畅的展开/收起动画
2. **Markdown 编辑器**：后台使用 Monaco Editor 或简单的 Textarea
3. **实时预览**：编辑时提供预览功能，所见即所得
4. **响应式设计**：移动端卡片单列显示，桌面端多列网格
5. **缓存策略**：期卡列表缓存 5 分钟，减少数据库查询
6. **SEO 优化**：使用语义化 HTML，添加 meta 描述
