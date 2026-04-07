/**
 * 标签管理功能测试脚本
 *
 * 此脚本用于验证标签管理的所有核心功能
 * 使用方式：在浏览器控制台中运行
 */

// ============ 测试工具函数 ============

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = (message, type = 'info') => {
  const colors = {
    info: '#2563eb',
    success: '#16a34a',
    error: '#dc2626',
    warning: '#ea580c'
  };
  console.log(`%c${message}`, `color: ${colors[type]}; font-weight: bold;`);
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`断言失败: ${message}`);
  }
  log(`✓ ${message}`, 'success');
};

// ============ 测试套件 ============

class TagManagementTests {
  constructor() {
    this.testTags = [];
    this.testSession = null;
  }

  async run() {
    log('开始标签管理功能测试...', 'info');

    try {
      await this.testTagCRUD();
      await this.testSessionTagOperations();
      await this.testTagFiltering();
      await this.testValidation();
      await this.cleanup();

      log('所有测试通过! ✓', 'success');
    } catch (error) {
      log(`测试失败: ${error.message}`, 'error');
      console.error(error);
      await this.cleanup();
    }
  }

  // ============ 标签 CRUD 测试 ============

  async testTagCRUD() {
    log('\n1. 测试标签 CRUD 操作', 'info');

    // 1.1 创建标签
    log('1.1 创建标签...', 'info');
    const createResponse = await window.electron.tags.create('测试标签1', '#3B82F6');
    assert(createResponse.success, '创建标签应该成功');
    assert(createResponse.data.name === '测试标签1', '标签名称应该正确');
    this.testTags.push(createResponse.data);

    // 1.2 创建重复标签（应该失败）
    log('1.2 测试创建重复标签...', 'info');
    const duplicateResponse = await window.electron.tags.create('测试标签1', '#EF4444');
    assert(!duplicateResponse.success, '创建重复标签应该失败');
    assert(duplicateResponse.error, '应该返回错误信息');

    // 1.3 获取所有标签
    log('1.3 获取所有标签...', 'info');
    const getAllResponse = await window.electron.tags.getAll();
    assert(getAllResponse.success, '获取标签列表应该成功');
    assert(Array.isArray(getAllResponse.data), '应该返回数组');
    assert(getAllResponse.data.length > 0, '标签列表不应为空');

    // 1.4 更新标签
    log('1.4 更新标签...', 'info');
    const updateResponse = await window.electron.tags.update(
      this.testTags[0].id,
      { name: '更新后的标签', color: '#22C55E' }
    );
    assert(updateResponse.success, '更新标签应该成功');
    assert(updateResponse.data.name === '更新后的标签', '标签名称应该已更新');
    assert(updateResponse.data.color === '#22C55E', '标签颜色应该已更新');

    // 1.5 创建更多测试标签
    log('1.5 创建更多测试标签...', 'info');
    const tag2 = await window.electron.tags.create('测试标签2', '#EF4444');
    const tag3 = await window.electron.tags.create('测试标签3', '#F59E0B');
    this.testTags.push(tag2.data, tag3.data);

    log('标签 CRUD 测试完成 ✓', 'success');
  }

  // ============ 会话标签操作测试 ============

  async testSessionTagOperations() {
    log('\n2. 测试会话标签操作', 'info');

    // 2.1 获取当前会话（假设有会话存在）
    log('2.1 获取会话列表...', 'info');
    const sessionListResponse = await window.electron.session.listWithOptions();
    assert(sessionListResponse.success, '获取会话列表应该成功');

    if (sessionListResponse.data && sessionListResponse.data.length > 0) {
      this.testSession = sessionListResponse.data[0];
      log(`使用会话: ${this.testSession.title}`, 'info');

      // 2.2 添加标签到会话
      log('2.2 为会话添加标签...', 'info');
      for (const tag of this.testTags) {
        const addResponse = await window.electron.session.addTag(
          this.testSession.id,
          tag.id
        );
        assert(addResponse.success, `添加标签 ${tag.name} 应该成功`);
        await sleep(100);
      }

      // 2.3 获取会话标签
      log('2.3 获取会话标签...', 'info');
      const getTagsResponse = await window.electron.session.getTags(this.testSession.id);
      assert(getTagsResponse.success, '获取会话标签应该成功');
      assert(
        getTagsResponse.data.length === this.testTags.length,
        `会话应该有 ${this.testTags.length} 个标签`
      );

      // 2.4 移除标签
      log('2.4 从会话移除标签...', 'info');
      const removeResponse = await window.electron.session.removeTag(
        this.testSession.id,
        this.testTags[0].id
      );
      assert(removeResponse.success, '移除标签应该成功');

      // 验证移除结果
      const verifyResponse = await window.electron.session.getTags(this.testSession.id);
      assert(
        verifyResponse.data.length === this.testTags.length - 1,
        '会话标签数量应该减少'
      );

      // 2.5 获取标签使用次数
      log('2.5 获取标签使用次数...', 'info');
      const usageResponse = await window.electron.tags.getUsageCount(this.testTags[1].id);
      assert(usageResponse.success, '获取使用次数应该成功');
      assert(usageResponse.data > 0, '使用次数应该大于 0');

      log('会话标签操作测试完成 ✓', 'success');
    } else {
      log('跳过会话标签测试（没有会话）', 'warning');
    }
  }

  // ============ 标签筛选测试 ============

  async testTagFiltering() {
    log('\n3. 测试标签筛选功能', 'info');

    if (!this.testSession) {
      log('跳过筛选测试（没有测试会话）', 'warning');
      return;
    }

    // 3.1 按标签筛选会话
    log('3.1 按标签筛选会话...', 'info');
    const filterResponse = await window.electron.session.listWithOptions({
      tagId: this.testTags[1].id
    });
    assert(filterResponse.success, '按标签筛选应该成功');
    assert(filterResponse.data.length > 0, '应该找到带有该标签的会话');

    // 3.2 搜索会话
    log('3.2 搜索会话...', 'info');
    const searchResponse = await window.electron.session.search('测试', {});
    assert(searchResponse.success, '搜索应该成功');

    log('标签筛选测试完成 ✓', 'success');
  }

  // ============ 验证测试 ============

  async testValidation() {
    log('\n4. 测试输入验证', 'info');

    // 4.1 空标签名称
    log('4.1 测试空标签名称...', 'info');
    const emptyNameResponse = await window.electron.tags.create('', '#3B82F6');
    assert(!emptyNameResponse.success, '空标签名称应该失败');

    // 4.2 超长标签名称（假设有长度限制）
    log('4.2 测试超长标签名称...', 'info');
    const longName = 'a'.repeat(100);
    const longNameResponse = await window.electron.tags.create(longName, '#3B82F6');
    // 这个测试取决于实际的验证规则

    // 4.3 无效标签 ID
    log('4.3 测试无效标签 ID...', 'info');
    const invalidIdResponse = await window.electron.tags.update('invalid-id', {
      name: '新名称'
    });
    assert(!invalidIdResponse.success, '无效 ID 应该失败');

    log('输入验证测试完成 ✓', 'success');
  }

  // ============ 清理测试数据 ============

  async cleanup() {
    log('\n5. 清理测试数据', 'info');

    // 移除测试标签
    for (const tag of this.testTags) {
      try {
        await window.electron.tags.delete(tag.id);
        log(`删除标签: ${tag.name}`, 'info');
      } catch (error) {
        log(`删除标签失败: ${tag.name}`, 'warning');
      }
    }

    log('清理完成 ✓', 'success');
  }
}

// ============ 执行测试 ============

async function runTests() {
  const tests = new TagManagementTests();
  await tests.run();
}

// ============ 单独测试函数（用于手动测试） ============

const tagTests = {
  // 测试创建标签
  async testCreate() {
    log('测试创建标签...', 'info');
    const response = await window.electron.tags.create('手动测试标签', '#3B82F6');
    console.log(response);
    return response;
  },

  // 测试获取所有标签
  async testGetAll() {
    log('测试获取所有标签...', 'info');
    const response = await window.electron.tags.getAll();
    console.log(response);
    return response;
  },

  // 测试更新标签
  async testUpdate(tagId) {
    log('测试更新标签...', 'info');
    const response = await window.electron.tags.update(tagId, {
      name: '已更新',
      color: '#EF4444'
    });
    console.log(response);
    return response;
  },

  // 测试删除标签
  async testDelete(tagId) {
    log('测试删除标签...', 'info');
    const response = await window.electron.tags.delete(tagId);
    console.log(response);
    return response;
  },

  // 测试添加标签到会话
  async testAddToSession(sessionId, tagId) {
    log('测试添加标签到会话...', 'info');
    const response = await window.electron.session.addTag(sessionId, tagId);
    console.log(response);
    return response;
  },

  // 测试从会话移除标签
  async testRemoveFromSession(sessionId, tagId) {
    log('测试从会话移除标签...', 'info');
    const response = await window.electron.session.removeTag(sessionId, tagId);
    console.log(response);
    return response;
  },

  // 测试获取会话标签
  async testGetSessionTags(sessionId) {
    log('测试获取会话标签...', 'info');
    const response = await window.electron.session.getTags(sessionId);
    console.log(response);
    return response;
  }
};

// ============ 导出 ============

console.log('标签管理测试工具已加载');
console.log('使用方式：');
console.log('1. 运行完整测试: runTests()');
console.log('2. 手动测试: tagTests.testCreate() 等');
console.log('');

// 如果在浏览器环境，自动运行测试
if (typeof window !== 'undefined' && window.electron) {
  console.log('检测到 Electron 环境，可以开始测试');
  console.log('执行 runTests() 开始自动测试');
}
