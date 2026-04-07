import { useState } from 'react';

// 简单的预览框架 - 通过 iframe 加载各版本
const versions = [
  { id: 'a', name: '版本 A: 科技感', color: '#00D9FF' },
  { id: 'b', name: '版本 B: 温暖友好', color: '#D97757' },
  { id: 'c', name: '版本 C: 开发者', color: '#7c3aed' },
];

export function DesignPreview() {
  const [activeVersion, setActiveVersion] = useState('a');

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a0f',
      color: '#e4e4ef',
      fontFamily: 'Inter, -apple-system, sans-serif'
    }}>
      {/* 顶部标签栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 20px',
        background: '#12121a',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <span style={{
          fontWeight: 700,
          fontSize: '16px',
          background: 'linear-gradient(135deg, #00D9FF, #A855F7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginRight: '24px'
        }}>
          Claude-Cowork SaaS 设计预览
        </span>

        {versions.map(v => (
          <button
            key={v.id}
            onClick={() => setActiveVersion(v.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeVersion === v.id ? `${v.color}22` : 'transparent',
              color: activeVersion === v.id ? v.color : '#a0a0b0',
              fontWeight: 500,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {v.name}
          </button>
        ))}
      </div>

      {/* 预览区域 */}
      <div style={{ flex: 1, position: 'relative' }}>
        {activeVersion === 'a' && <VersionA />}
        {activeVersion === 'b' && <VersionB />}
        {activeVersion === 'c' && <VersionC />}
      </div>
    </div>
  );
}

// ============================================
// 版本 A: 科技感 (Neo-Tech)
// ============================================
function VersionA() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      background: '#0A0A0F',
      color: '#F5F5F7'
    }}>
      {/* 左侧边栏 */}
      <aside style={{
        width: '280px',
        background: '#12121A',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ padding: '16px' }}>
          <button style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '14px',
            border: '1px solid transparent',
            background: 'linear-gradient(#12121A, #12121A) padding-box, linear-gradient(135deg, #00D9FF, #A855F7) border-box',
            color: '#fff',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}>
            <span>+</span> 新建会话
          </button>
        </div>

        <input
          placeholder="搜索会话..."
          style={{
            margin: '0 16px 12px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: '#1A1A24',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#fff',
            fontSize: '13px'
          }}
        />

        <div style={{ padding: '8px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B6B7B', textTransform: 'uppercase', marginBottom: '8px' }}>今天</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'rgba(0, 217, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            position: 'relative',
            marginBottom: '4px'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00D9FF' }} />
            <span style={{ fontSize: '13px' }}>JWT 认证实现</span>
          </div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
            <span style={{ fontSize: '13px', color: '#A8A8B3' }}>数据库优化方案</span>
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 头部 */}
        <header style={{
          height: '52px',
          background: '#12121A',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px'
        }}>
          <span style={{ fontWeight: 500 }}>JWT 认证实现</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(0,217,255,0.15), rgba(168,85,247,0.15))',
              fontSize: '12px',
              fontWeight: 500,
              color: '#00D9FF'
            }}>47.83 积分</span>
            <button style={{ background: 'none', border: 'none', color: '#A8A8B3', cursor: 'pointer' }}>⚙️</button>
          </div>
        </header>

        {/* 聊天区域 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* 用户消息 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <div style={{
              padding: '14px 18px',
              borderRadius: '18px',
              background: 'linear-gradient(135deg, rgba(0,217,255,0.2), rgba(0,217,255,0.1))',
              border: '1px solid rgba(0,217,255,0.2)',
              maxWidth: '600px',
              fontSize: '14px'
            }}>
              帮我实现 Express.js API 的 JWT 用户认证功能
            </div>
          </div>

          {/* AI 消息 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              padding: '14px 18px',
              borderRadius: '18px',
              background: '#1E1E2A',
              border: '1px solid rgba(255,255,255,0.06)',
              maxWidth: '720px',
              fontSize: '14px',
              lineHeight: 1.6
            }}>
              我来帮你实现 JWT 认证。首先让我分析你的项目结构，然后创建认证中间件。
            </div>

            {/* 思考块 */}
            <div style={{
              marginTop: '12px',
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              fontSize: '13px',
              color: '#F59E0B',
              maxWidth: '720px'
            }}>
              💭 正在分析：检查 package.json 确认依赖，创建 auth middleware...
            </div>

            {/* 工具调用 */}
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: '12px',
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              maxWidth: '720px'
            }}>
              <span style={{ color: '#10B981' }}>●</span>
              <span style={{ color: '#A855F7', fontWeight: 500 }}>Read</span>
              <span style={{ color: '#A8A8B3', fontFamily: 'monospace', fontSize: '12px' }}>package.json</span>
            </div>

            {/* 代码块 */}
            <div style={{
              marginTop: '12px',
              borderRadius: '12px',
              background: '#0A0A0F',
              border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
              maxWidth: '720px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.06)'
              }}>
                <span style={{ fontSize: '11px', color: '#6B6B7B' }}>middleware/auth.ts</span>
                <button style={{ fontSize: '11px', color: '#00D9FF', background: 'none', border: 'none', cursor: 'pointer' }}>复制</button>
              </div>
              <pre style={{
                margin: 0,
                padding: '14px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '13px',
                lineHeight: 1.6,
                overflow: 'auto'
              }}>
{`import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export const authenticateToken = (
  req: Request, res: Response, next: NextFunction
) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  // ...
};`}
              </pre>
            </div>

            {/* 消息元数据 */}
            <div style={{
              marginTop: '8px',
              display: 'flex',
              gap: '12px',
              fontSize: '11px',
              color: '#6B6B7B'
            }}>
              <span>⏱ 8.5s</span>
              <span>📥 1,250 tokens</span>
              <span>📤 2,340 tokens</span>
              <span>💰 0.61 积分</span>
            </div>
          </div>
        </div>

        {/* 输入区域 */}
        <div style={{ padding: '16px 24px 24px', background: 'linear-gradient(to top, #0A0A0F 60%, transparent)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {['/commit', '/review-pr', '/tdd', '/refactor'].map(skill => (
              <span key={skill} style={{
                padding: '6px 12px',
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '12px',
                color: '#A8A8B3',
                cursor: 'pointer'
              }}>{skill}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              placeholder="输入消息，或使用 / 调用 Skill..."
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: '16px',
                background: '#1E1E2A',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#F5F5F7',
                fontSize: '14px'
              }}
            />
            <button style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              border: 'none',
              background: 'linear-gradient(135deg, #00D9FF, #A855F7)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '18px'
            }}>➤</button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================
// 版本 B: 温暖友好 (Warm & Craft)
// ============================================
function VersionB() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      background: '#FDFCFA',
      color: '#383a42',
      fontFamily: 'Inter, -apple-system, sans-serif'
    }}>
      {/* 左侧边栏 */}
      <aside style={{
        width: '280px',
        background: '#F8F6F3',
        borderRight: '1px solid #E8E4DE',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ padding: '16px' }}>
          <button style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '14px',
            border: 'none',
            background: '#D97757',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '14px'
          }}>
            ✨ 开始新对话
          </button>
        </div>

        <input
          placeholder="搜索历史对话..."
          style={{
            margin: '0 16px 12px',
            padding: '10px 14px',
            borderRadius: '12px',
            background: '#fff',
            border: '1px solid #E8E4DE',
            color: '#383a42',
            fontSize: '13px'
          }}
        />

        <div style={{ padding: '8px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '8px' }}>今天</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(217, 119, 87, 0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '4px'
          }}>
            <span style={{ fontSize: '18px' }}>🔐</span>
            <span style={{ fontSize: '13px' }}>用户认证系统</span>
          </div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '18px' }}>📊</span>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>数据可视化图表</span>
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 头部 */}
        <header style={{
          height: '56px',
          background: '#fff',
          borderBottom: '1px solid #E8E4DE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px'
        }}>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>🔐 用户认证系统</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              padding: '6px 14px',
              borderRadius: '20px',
              background: '#FEF3EC',
              fontSize: '13px',
              fontWeight: 600,
              color: '#D97757'
            }}>47.83 积分</span>
          </div>
        </header>

        {/* 聊天区域 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* 用户消息 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px', gap: '12px' }}>
            <div style={{
              padding: '14px 18px',
              borderRadius: '20px',
              borderBottomRightRadius: '6px',
              background: '#E8F0FE',
              maxWidth: '600px',
              fontSize: '14px',
              color: '#1E40AF'
            }}>
              帮我实现一个简单的用户登录功能
            </div>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: '#E8F0FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>👤</div>
          </div>

          {/* AI 消息 */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: '#FEF3EC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              flexShrink: 0
            }}>🤖</div>
            <div>
              <div style={{
                padding: '14px 18px',
                borderRadius: '20px',
                borderBottomLeftRadius: '6px',
                background: '#FBF8F3',
                border: '1px solid #E8E4DE',
                maxWidth: '650px',
                fontSize: '14px',
                lineHeight: 1.7
              }}>
                当然可以！我来帮你创建一个安全的用户登录功能。让我先看看你的项目结构。
              </div>

              {/* 思考块 */}
              <div style={{
                marginTop: '12px',
                padding: '12px 16px',
                borderRadius: '14px',
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                fontSize: '13px',
                color: '#92400E',
                maxWidth: '650px'
              }}>
                💭 正在思考最佳实现方案：考虑密码加密、会话管理、安全性...
              </div>

              {/* 工具调用 */}
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '14px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                maxWidth: '650px'
              }}>
                <span>📂</span>
                <span style={{ color: '#166534', fontWeight: 500 }}>读取文件</span>
                <span style={{ color: '#6B7280', fontFamily: 'monospace', fontSize: '12px' }}>package.json</span>
              </div>

              {/* 代码块 */}
              <div style={{
                marginTop: '12px',
                borderRadius: '14px',
                background: '#1F2937',
                overflow: 'hidden',
                maxWidth: '650px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#374151'
                }}>
                  <span style={{ fontSize: '12px', color: '#9CA3AF' }}>auth/login.ts</span>
                  <button style={{ fontSize: '12px', color: '#D97757', background: 'none', border: 'none', cursor: 'pointer' }}>复制代码</button>
                </div>
                <pre style={{
                  margin: 0,
                  padding: '14px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: '#E5E7EB',
                  overflow: 'auto'
                }}>
{`import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export async function login(email, password) {
  const user = await findUserByEmail(email);
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
}`}
                </pre>
              </div>

              {/* 消息元数据 */}
              <div style={{
                marginTop: '8px',
                display: 'flex',
                gap: '12px',
                fontSize: '11px',
                color: '#9CA3AF'
              }}>
                <span>⏱️ 6.2 秒</span>
                <span>📥 980 tokens</span>
                <span>📤 1,850 tokens</span>
                <span>💰 0.47 积分</span>
              </div>
            </div>
          </div>
        </div>

        {/* 输入区域 */}
        <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #E8E4DE' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {['✨ /commit', '📝 /review', '🧪 /test', '🔧 /fix'].map(skill => (
              <span key={skill} style={{
                padding: '6px 14px',
                borderRadius: '20px',
                background: '#fff',
                border: '1px solid #E8E4DE',
                fontSize: '12px',
                color: '#6B7280',
                cursor: 'pointer'
              }}>{skill}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              placeholder="有什么我可以帮助你的吗？"
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: '18px',
                background: '#fff',
                border: '2px solid #E8E4DE',
                color: '#383a42',
                fontSize: '14px'
              }}
            />
            <button style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              border: 'none',
              background: '#D97757',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '18px'
            }}>➤</button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================
// 版本 C: 开发者工作室 (Dev Studio)
// ============================================
function VersionC() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#1e1e2e',
      color: '#e4e4ef',
      fontFamily: 'Inter, -apple-system, sans-serif'
    }}>
      {/* 标题栏 */}
      <div style={{
        height: '40px',
        background: '#252536',
        borderBottom: '1px solid #3d3d5c',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', gap: '8px', marginRight: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#febc2e' }} />
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28c840' }} />
        </div>
        <div style={{
          padding: '8px 16px',
          borderRadius: '6px 6px 0 0',
          background: '#2d2d40',
          border: '1px solid #3d3d5c',
          borderBottom: 'none',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚡</span>
          <span>jwt-auth</span>
          <span style={{ opacity: 0.5 }}>×</span>
        </div>
        <div style={{
          padding: '8px 16px',
          background: '#1e1e2e',
          border: '1px solid #3d3d5c',
          borderBottom: 'none',
          borderRadius: '6px 6px 0 0',
          fontSize: '12px',
          color: '#a0a0b0'
        }}>
          <span>📊</span> db-optimize
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{
            fontSize: '11px',
            fontFamily: 'JetBrains Mono, monospace',
            color: '#7c3aed',
            padding: '4px 10px',
            background: 'rgba(124, 58, 237, 0.15)',
            borderRadius: '4px'
          }}>47.83 积分</span>
        </div>
      </div>

      {/* 主内容 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 侧边栏 */}
        <aside style={{
          width: '240px',
          background: '#252536',
          borderRight: '1px solid #3d3d5c',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid #3d3d5c',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b6b80', textTransform: 'uppercase' }}>Sessions</span>
            <span style={{ color: '#6b6b80', cursor: 'pointer' }}>+</span>
          </div>
          <div style={{ padding: '8px' }}>
            <div style={{
              padding: '8px 10px',
              borderRadius: '6px',
              background: 'rgba(124, 58, 237, 0.15)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px'
            }}>
              <span>⚡</span> jwt-auth
            </div>
            <div style={{
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#a0a0b0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>📊</span> db-optimize
            </div>
          </div>
        </aside>

        {/* 聊天面板 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* 聊天区域 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {/* 用户消息 */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: '#7c3aed' }}>USER</span>
                <span style={{ color: '#6b6b80', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>14:32:15</span>
              </div>
              <div style={{
                padding: '10px 14px',
                background: '#252536',
                borderRadius: '6px',
                borderLeft: '3px solid #7c3aed',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '13px'
              }}>
                implement jwt authentication middleware for express
              </div>
            </div>

            {/* AI 消息 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: '#10b981' }}>ASSISTANT</span>
                <span style={{ color: '#6b6b80', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>14:32:18</span>
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                I'll create a JWT authentication middleware for your Express API.
              </div>

              {/* 思考块 */}
              <div style={{
                marginTop: '8px',
                padding: '10px 14px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                fontSize: '12px',
                color: '#F59E0B',
                fontFamily: 'JetBrains Mono, monospace'
              }}>
                analyzing project structure... checking dependencies... creating auth middleware
              </div>

              {/* 工具调用 */}
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: '#252536',
                border: '1px solid #3d3d5c',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                fontFamily: 'JetBrains Mono, monospace'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                <span style={{ color: '#61afef' }}>Read</span>
                <span style={{ color: '#6b6b80' }}>package.json → 150 bytes</span>
              </div>

              {/* 代码块 */}
              <div style={{
                marginTop: '8px',
                borderRadius: '6px',
                background: '#0d0d14',
                border: '1px solid #3d3d5c',
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  background: '#1a1a24',
                  borderBottom: '1px solid #3d3d5c'
                }}>
                  <span style={{ fontSize: '11px', color: '#6b6b80', fontFamily: 'JetBrains Mono, monospace' }}>📄 middleware/auth.ts</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ fontSize: '11px', color: '#6b6b80', background: 'none', border: 'none', cursor: 'pointer' }}>Copy</button>
                    <button style={{ fontSize: '11px', color: '#6b6b80', background: 'none', border: 'none', cursor: 'pointer' }}>Run</button>
                  </div>
                </div>
                <div style={{ display: 'flex', padding: '12px' }}>
                  <div style={{
                    color: '#4a4a5a',
                    textAlign: 'right',
                    paddingRight: '12px',
                    marginRight: '12px',
                    borderRight: '1px solid #3d3d5c',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    userSelect: 'none'
                  }}>
                    1<br/>2<br/>3<br/>4<br/>5<br/>6<br/>7<br/>8
                  </div>
                  <pre style={{
                    margin: 0,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                    lineHeight: 1.5
                  }}>
{`import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  // ...
};`}
                  </pre>
                </div>
              </div>

              {/* 元数据 */}
              <div style={{
                marginTop: '8px',
                display: 'flex',
                gap: '16px',
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace',
                color: '#6b6b80'
              }}>
                <span>⏱ 8.5s</span>
                <span>↓ 1.2K tokens</span>
                <span>↑ 2.3K tokens</span>
                <span>$ 0.0085</span>
              </div>
            </div>
          </div>

          {/* 输入区域 */}
          <div style={{
            padding: '12px 16px',
            background: '#252536',
            borderTop: '1px solid #3d3d5c'
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                placeholder="Type a command or message... (Ctrl+P for command palette)"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: '#1e1e2e',
                  border: '1px solid #3d3d5c',
                  color: '#e4e4ef',
                  fontSize: '13px',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              />
              <button style={{
                padding: '0 20px',
                borderRadius: '6px',
                border: 'none',
                background: '#7c3aed',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer'
              }}>
                ➤ Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <div style={{
        height: '24px',
        background: '#1a1a24',
        borderTop: '1px solid #3d3d5c',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: '11px',
        fontFamily: 'JetBrains Mono, monospace',
        color: '#6b6b80'
      }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
            Connected
          </span>
          <span>claude-3.5-sonnet</span>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Tokens: 3.5K</span>
          <span>Cost: 0.61 积分</span>
          <span>Ln 15, Col 2</span>
        </div>
      </div>
    </div>
  );
}

export default DesignPreview;
