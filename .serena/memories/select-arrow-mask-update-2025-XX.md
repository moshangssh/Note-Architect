在 styles.css 中将下拉箭头切换为 mask 方案：
- 根变量仅保留一份箭头 SVG（黑色填充用于 mask），去掉 light/dark 双份资源和 --note-architect-select-arrow-current。
- .note-architect-field-select/.note-architect-form-select 使用 ::after 伪元素，box 自身 appearance:none + position:relative，伪元素用 background-color: currentColor 搭配 -webkit-mask-image/mask-image 引用箭头，居右 12px，尺寸 12px，pointer-events:none。
- 依赖 text color 自动随主题变色，不再需要 theme-dark 覆盖。
若未来调整箭头颜色或大小，修改根变量的 SVG 或伪元素尺寸即可。