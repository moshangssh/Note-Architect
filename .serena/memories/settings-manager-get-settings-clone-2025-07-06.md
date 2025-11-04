# 2025-07-06 SettingsManager.getSettings 深拷贝
- SettingsManager.getSettings 现返回 structuredClone(this.settings)，外部调用者无法再直接修改内部状态。
- SettingsManager.settings 属性保持 private，仅通过克隆访问。