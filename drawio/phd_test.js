/**
 * 超简单测试插件
 */
Draw.loadPlugin(function(ui) {
    // 强制弹窗
    mxUtils.alert('恭喜！插件已成功加载。');
    
    // 并在控制台打印一条消息（F12可见）
    console.log('--- PhD Custom Plugin Active ---');
});
