import * as React from 'react';
import { useState } from 'react';
import { CodeBlock } from './CodeBlock';

/**
 * CodeBlock 组件演示页面
 * 用于手动验证所有功能
 */
export function CodeBlockDemo() {
  const [copied, setCopied] = useState(false);

  // 示例代码
  const javascriptCode = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 测试函数
console.log(fibonacci(10)); // 输出: 55`;

  const typescriptCode = `interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  getAllUsers(): User[] {
    return [...this.users];
  }
}

const service = new UserService();
service.addUser({
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
  createdAt: new Date()
});`;

  const pythonCode = `def quick_sort(arr):
    if len(arr) <= 1:
        return arr

    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]

    return quick_sort(left) + middle + quick_sort(right)

# 测试
numbers = [3, 6, 8, 10, 1, 2, 1]
print(quick_sort(numbers))  # [1, 1, 2, 3, 6, 8, 10]`;

  const htmlCode = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>响应式网页</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <nav>
      <ul>
        <li><a href="#home">首页</a></li>
        <li><a href="#about">关于</a></li>
        <li><a href="#contact">联系</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <h1>欢迎来到我的网站</h1>
    <p>这是一个示例页面。</p>
  </main>
  <footer>
    <p>&copy; 2026 版权所有</p>
  </footer>
  <script src="script.js"></script>
</body>
</html>`;

  const cssCode = `.container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.15);
}

@media (max-width: 768px) {
  .container {
    grid-template-columns: 1fr;
    padding: 1rem;
  }
}`;

  const sqlCode = `-- 创建用户表
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建订单表
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 查询用户及其订单
SELECT
  u.username,
  u.email,
  COUNT(o.id) as order_count,
  SUM(o.total_amount) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.status = 'completed'
GROUP BY u.id, u.username, u.email
HAVING total_spent > 1000
ORDER BY total_spent DESC
LIMIT 10;`;

  const bashCode = `#!/bin/bash

# 部署脚本
set -e

echo "开始部署..."

# 拉取最新代码
git pull origin main

# 安装依赖
npm install

# 运行测试
npm test

# 构建项目
npm run build

# 重启服务
pm2 restart app

echo "部署完成！"

# 检查服务状态
pm2 status

# 显示最近的日志
pm2 logs app --lines 50`;

  const goCode = `package main

import (
	"fmt"
	"net/http"
	"time"
)

type Server struct {
	port string
}

func NewServer(port string) *Server {
	return &Server{port: port}
}

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "欢迎访问首页！")
}

func (s *Server) handleAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, \`{"message": "Hello from API", "timestamp": %d}\`, time.Now().Unix())
}

func (s *Server) Start() error {
	http.HandleFunc("/", s.handleHome)
	http.HandleFunc("/api", s.handleAPI)

	fmt.Printf("服务器运行在 http://localhost%s\n", s.port)
	return http.ListenAndServe(s.port, nil)
}

func main() {
	server := NewServer(":8080")
	if err := server.Start(); err != nil {
		panic(err)
	}
}`;

  const rustCode = `use std::collections::HashMap;

#[derive(Debug, Clone)]
struct User {
    id: u32,
    name: String,
    email: String,
}

struct UserRepository {
    users: HashMap<u32, User>,
}

impl UserRepository {
    fn new() -> Self {
        UserRepository {
            users: HashMap::new(),
        }
    }

    fn add_user(&mut self, user: User) {
        self.users.insert(user.id, user);
    }

    fn get_user(&self, id: u32) -> Option<&User> {
        self.users.get(&id)
    }

    fn remove_user(&mut self, id: u32) -> Option<User> {
        self.users.remove(&id)
    }
}

fn main() {
    let mut repo = UserRepository::new();

    repo.add_user(User {
        id: 1,
        name: String::from("Alice"),
        email: String::from("alice@example.com"),
    });

    if let Some(user) = repo.get_user(1) {
        println!("找到用户: {:?}", user);
    }
}`;

  const longCode = Array(50)
    .fill(null)
    .map((_, i) => `function example${i}() {\n  console.log("Line ${i}");\n  return ${i};\n}`)
    .join('\n\n');

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* 标题 */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-ink-900">CodeBlock 组件演示</h1>
          <p className="text-lg text-muted">验证语法高亮、行号、复制功能和多语言支持</p>
        </div>

        {/* JavaScript */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">1. JavaScript（带文件名）</h2>
          <CodeBlock
            code={javascriptCode}
            language="javascript"
            filename="fibonacci.js"
            onCopy={() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          />
          {copied && <p className="text-sm text-chart-2">✓ 代码已复制到剪贴板</p>}
        </section>

        {/* TypeScript */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">2. TypeScript（长代码示例）</h2>
          <CodeBlock
            code={typescriptCode}
            language="typescript"
            filename="UserService.ts"
          />
        </section>

        {/* Python */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">3. Python（使用别名 py）</h2>
          <CodeBlock code={pythonCode} language="py" filename="quick_sort.py" />
        </section>

        {/* HTML */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">4. HTML</h2>
          <CodeBlock code={htmlCode} language="html" filename="index.html" />
        </section>

        {/* CSS */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">5. CSS（响应式设计）</h2>
          <CodeBlock code={cssCode} language="css" filename="styles.css" />
        </section>

        {/* SQL */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">6. SQL</h2>
          <CodeBlock code={sqlCode} language="sql" filename="schema.sql" />
        </section>

        {/* Bash */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">7. Bash（部署脚本）</h2>
          <CodeBlock code={bashCode} language="bash" filename="deploy.sh" />
        </section>

        {/* Go */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">8. Go</h2>
          <CodeBlock code={goCode} language="go" filename="server.go" />
        </section>

        {/* Rust */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">9. Rust</h2>
          <CodeBlock code={rustCode} language="rust" filename="user_repository.rs" />
        </section>

        {/* 行高亮 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">10. 行高亮功能</h2>
          <CodeBlock
            code={javascriptCode}
            language="javascript"
            highlightLines={[2, 3, 7]}
            filename="fibonacci.js"
          />
        </section>

        {/* 自定义起始行号 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">11. 自定义起始行号（从 100 开始）</h2>
          <CodeBlock
            code={javascriptCode}
            language="javascript"
            startLineNumber={100}
          />
        </section>

        {/* 隐藏行号 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">12. 隐藏行号</h2>
          <CodeBlock
            code={javascriptCode}
            language="javascript"
            showLineNumbers={false}
          />
        </section>

        {/* 没有文件名 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">13. 没有文件名（只显示语言）</h2>
          <CodeBlock code={javascriptCode} language="javascript" />
        </section>

        {/* 自定义最大高度 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">
            14. 自定义最大高度（200px，长代码可滚动）
          </h2>
          <CodeBlock code={longCode} language="javascript" maxHeight="200px" />
        </section>

        {/* 语言别名测试 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">15. 语言别名测试</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">js → JavaScript</h3>
              <CodeBlock code="const x = 1;" language="js" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">ts → TypeScript</h3>
              <CodeBlock code="const x: number = 1;" language="ts" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">py → Python</h3>
              <CodeBlock code="x = 1" language="py" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">sh → Bash</h3>
              <CodeBlock code="echo 'Hello'" language="sh" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">yml → YAML</h3>
              <CodeBlock code="name: test\nversion: 1.0" language="yml" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">md → Markdown</h3>
              <CodeBlock code="# Hello\n\n- Item 1\n- Item 2" language="md" />
            </div>
          </div>
        </section>

        {/* 空代码 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">16. 边界情况：空代码</h2>
          <CodeBlock code="" language="javascript" />
        </section>

        {/* 单行代码 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">17. 边界情况：单行代码</h2>
          <CodeBlock code="console.log('Hello World');" language="javascript" />
        </section>

        {/* 只有空行 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">18. 边界情况：只有空行</h2>
          <CodeBlock code="\n\n\n" language="javascript" />
        </section>

        {/* 未知语言 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">19. 未知语言（显示大写）</h2>
          <CodeBlock code="some unknown language code" language="unknown" />
        </section>

        {/* 功能清单 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">✓ 功能验证清单</h2>
          <div className="bg-surface-secondary rounded-xl p-6 space-y-2">
            <CheckItem>语法高亮（多种语言）</CheckItem>
            <CheckItem>行号显示（可选）</CheckItem>
            <CheckItem>自定义起始行号</CheckItem>
            <CheckItem>行高亮功能</CheckItem>
            <CheckItem>文件名显示</CheckItem>
            <CheckItem>语言标签显示</CheckItem>
            <CheckItem>复制按钮</CheckItem>
            <CheckItem>复制成功反馈（2秒后恢复）</CheckItem>
            <CheckItem>复制回调函数</CheckItem>
            <CheckItem>自定义最大高度</CheckItem>
            <CheckItem>长代码滚动</CheckItem>
            <CheckItem>语言别名支持（js, ts, py, sh, yml, md）</CheckItem>
            <CheckItem>未知语言处理</CheckItem>
            <CheckItem>空代码处理</CheckItem>
            <CheckItem>单行代码处理</CheckItem>
            <CheckItem>响应式设计</CheckItem>
            <CheckItem>无障碍支持（aria-hidden, title）</CheckItem>
            <CheckItem>性能优化（useMemo, useCallback）</CheckItem>
          </div>
        </section>

        {/* 测试说明 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-ink-900">测试说明</h2>
          <div className="bg-accent-subtle rounded-xl p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-ink-900 mb-2">手动测试步骤：</h3>
              <ol className="list-decimal ml-6 space-y-2 text-ink-700">
                <li>检查所有代码块是否正确渲染</li>
                <li>验证语法高亮是否生效（不同颜色显示关键字、字符串、注释等）</li>
                <li>验证行号是否正确显示</li>
                <li>验证文件名和语言标签是否正确显示</li>
                <li>点击复制按钮，验证是否复制成功</li>
                <li>检查复制按钮状态是否在 2 秒后恢复</li>
                <li>验证行高亮是否正确（示例 10）</li>
                <li>验证自定义起始行号是否正确（示例 11）</li>
                <li>验证隐藏行号功能（示例 12）</li>
                <li>验证长代码滚动功能（示例 14）</li>
                <li>验证语言别名是否正确转换（示例 15）</li>
                <li>验证边界情况处理（示例 16-18）</li>
                <li>在不同屏幕尺寸下测试响应式布局</li>
                <li>使用键盘导航测试无障碍性</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <svg
        className="h-5 w-5 text-chart-2 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span className="text-ink-700">{children}</span>
    </div>
  );
}

export default CodeBlockDemo;
