# 模型介绍功能 - 调研报告

## 展示方式对比

| 方式 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **Tooltip** | 轻量、不打断流程 | 内容有限、不支持富文本 | 简短说明（<100字） |
| **Popover** | 平衡内容和体验 | 需要点击触发 | 中等长度（100-200字）**推荐** |
| **Modal** | 内容丰富、支持富文本 | 打断用户流程 | 详细介绍（>200字） |
| **Inline** | 始终可见、无需交互 | 占用空间 | 关键信息 |

## 推荐方案：Popover + 图标按钮

### 为什么选择 Popover
- 不打断用户流程（相比 Modal）
- 支持富文本内容（相比 Tooltip）
- 点击触发，避免误触（相比 Tooltip 的 hover）
- 可包含链接、列表等复杂内容

## 数据库设计

### 方案 1：简单字段（推荐）
```sql
ALTER TABLE models
  ADD COLUMN description TEXT,
  ADD COLUMN description_format VARCHAR(20) DEFAULT 'markdown',
  ADD COLUMN features JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN use_cases JSONB DEFAULT '[]'::jsonb;

-- 示例数据
UPDATE models SET
  description = 'Claude Opus 4.6 是最强大的模型，适合复杂推理任务',
  features = '["长上下文", "多模态", "工具使用"]'::jsonb,
  use_cases = '["代码生成", "数据分析", "创意写作"]'::jsonb
WHERE name = 'claude-opus-4-6';
```

### 方案 2：独立表（适合多语言）
```sql
CREATE TABLE model_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES models(id),
  language VARCHAR(10) DEFAULT 'zh-CN',
  description TEXT NOT NULL,
  features JSONB DEFAULT '[]'::jsonb,
  use_cases JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model_id, language)
);
```

## 前端实现

### 桌面端展示
```tsx
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { InfoIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function ModelSelector() {
  return (
    <div className="flex items-center gap-2">
      <select>
        <option value="claude-opus-4-6">Claude Opus 4.6</option>
      </select>

      <Popover>
        <PopoverTrigger asChild>
          <button className="text-gray-400 hover:text-gray-600 transition">
            <InfoIcon size={16} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <h4 className="font-semibold text-lg">{model.name}</h4>

            <ReactMarkdown className="text-sm text-gray-700">
              {model.description}
            </ReactMarkdown>

            {model.features && model.features.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">特性：</p>
                <div className="flex flex-wrap gap-1">
                  {model.features.map(f => (
                    <span key={f} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {model.use_cases && model.use_cases.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">适用场景：</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {model.use_cases.map(uc => <li key={uc}>{uc}</li>)}
                </ul>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

## 后台管理实现

```tsx
export function ModelDescriptionForm() {
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [useCases, setUseCases] = useState<string[]>([]);

  return (
    <Form onSubmit={handleSubmit}>
      <FormField>
        <Label>模型介绍</Label>
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">编辑</TabsTrigger>
            <TabsTrigger value="preview">预览</TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="支持 Markdown 格式"
              rows={6}
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="border rounded p-4 min-h-[150px]">
              <ReactMarkdown>{description}</ReactMarkdown>
            </div>
          </TabsContent>
        </Tabs>
      </FormField>

      <FormField>
        <Label>特性标签</Label>
        <TagInput
          value={features}
          onChange={setFeatures}
          placeholder="输入特性后按回车"
        />
      </FormField>

      <FormField>
        <Label>适用场景</Label>
        <TagInput
          value={useCases}
          onChange={setUseCases}
          placeholder="输入场景后按回车"
        />
      </FormField>

      <Button type="submit">保存</Button>
    </Form>
  );
}
```

## API 接口

```typescript
// GET /api/models/:id/description
export async function getModelDescription(req: Request, res: Response) {
  const { id } = req.params;
  const model = await db.query.models.findFirst({
    where: eq(models.id, id),
    columns: {
      id: true,
      name: true,
      description: true,
      features: true,
      use_cases: true,
    },
  });

  res.json(model);
}

// PUT /api/admin/models/:id/description
export async function updateModelDescription(req: Request, res: Response) {
  const { id } = req.params;
  const { description, features, use_cases } = req.body;

  await db.update(models)
    .set({
      description,
      features,
      use_cases,
      updated_at: new Date(),
    })
    .where(eq(models.id, id));

  res.json({ success: true });
}
```

## 实现建议

1. **使用 shadcn/ui Popover**：开箱即用，样式统一
2. **Markdown 支持**：使用 react-markdown 渲染富文本
3. **缓存策略**：前端缓存模型介绍，减少 API 调用
4. **渐进增强**：先实现基础文本，再添加特性标签
5. **国际化预留**：数据库设计考虑多语言支持
