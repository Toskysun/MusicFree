# 🎵 MusicFree (Modified Version)

<div align="center">

  **基于原版优化的插件化音乐播放器**

  [English](./readme-en.md) | 简体中文

  [![License](https://img.shields.io/badge/license-AGPL%203.0-blue)](LICENSE)
  [![Version](https://img.shields.io/github/v/release/Toskysun/MusicFree?color=green)](https://github.com/Toskysun/MusicFree/releases)
  [![Platform](https://img.shields.io/badge/platform-Android-orange)]()

</div>

---

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 🎯 插件系统
- 🔌 **完全插件化**：音源、搜索、播放全部基于插件
- 🎵 **ikun音源**：支持8种音质级别
- 📦 **灵活管理**：支持本地和网络插件安装

</td>
<td width="50%">

### 🎨 个性化
- 🎭 **主题定制**：深色/浅色模式，自定义背景
- 🏷️ **音质标签**：根据喜好定制音质显示
- 🚀 **启动优化**：可设置启动时打开播放详情

</td>
</tr>
<tr>
<td width="50%">

### 📥 下载增强
- 🔔 **下载通知**：实时显示下载进度
- 📝 **文件命名**：支持多种命名格式
- 🏷️ **音乐标签**：下载时自动写入元数据

</td>
<td width="50%">

### 🔒 隐私安全
- 💾 **本地存储**：所有数据存储在本地
- 🚫 **无广告**：完全免费，无任何广告
- 🔓 **开源透明**：基于AGPL 3.0协议

</td>
</tr>
</table>

## 🚀 快速开始

### 📲 安装应用
1. 前往 [Releases](https://github.com/Toskysun/MusicFree/releases) 下载最新版本
2. 安装APK文件到Android设备

### 🔌 安装插件

#### ikun音源插件（推荐）
```
https://musicfree-plugins.netlify.app
```

#### 插件安装步骤
1. 打开应用 → 侧边栏 → 设置 → 插件设置
2. 选择"从网络安装插件"
3. 输入插件地址并确认

## 📖 文档

- 📚 **插件开发**：[开发文档](https://musicfree.catcat.work/plugin/introduction.html)
- ❓ **常见问题**：[Q&A文档](https://musicfree.catcat.work/qa/common.html)
- 🔧 **使用指南**：[详细教程](https://musicfree.catcat.work/usage/mobile/install-plugin.html)

## 🔧 插件开发指南

### 音质键值 (IQualityKey)

本版本支持以下 **9 种音质等级**：

| 音质键值 | 说明 | 比特率/格式 |
|---------|------|-----------|
| `128k` | 普通音质 | 128 kbps |
| `192k` | 中等音质 | 192 kbps |
| `320k` | 高清音质 | 320 kbps |
| `flac` | 高清无损 | FLAC |
| `flac24bit` | 高解析度无损 | FLAC 24-bit |
| `hires` | 高解析度 | Hi-Res |
| `atmos` | 杜比全景声 | Dolby Atmos |
| `atmos_plus` | 杜比全景声 2.0 | Dolby Atmos+ |
| `master` | 母带音质 | Master |

### 原版插件兼容

本版本**完全兼容原版插件**，原版音质键值会自动转换：

| 原版键值 | 转换为本版 | 说明 |
|---------|-----------|------|
| `low` | `128k` | 低音质 → 普通音质 |
| `standard` | `192k` | 标准音质 → 中等音质 |
| `high` | `320k` | 高音质 → 高清音质 |
| `super` | `flac` | 超高音质 → 无损音质 |

**开发建议**：
- ✅ 新开发插件请使用本版音质键值
- ✅ 原版插件无需修改，自动兼容
- ✅ 用户界面统一显示本版音质名称

## 🤝 关于项目

### 致谢

本项目基于 [MusicFree](https://github.com/maotoumao/MusicFree) 修改优化

**原作者**：[maotoumao](https://github.com/maotoumao)
**原项目**：[https://github.com/maotoumao/MusicFree](https://github.com/maotoumao/MusicFree)

### 修改说明

本版本基于原版 v0.6.1，主要改进包括：
- 新增ikun音源支持（8种音质）
- 增强下载功能（通知、命名、标签）
- 优化个性化设置
- 修复多个已知问题

## 📄 协议

本项目遵循 [AGPL-3.0](LICENSE) 开源协议

**重要提示**：
- ⚠️ 禁止用于商业用途
- ⚠️ 请合法合规使用
- ⚠️ 插件产生的数据与本软件无关

## 💬 反馈

遇到问题或有建议？欢迎 [提交Issue](../../issues)

---

<div align="center">
  Made with ❤️ by the community
</div>