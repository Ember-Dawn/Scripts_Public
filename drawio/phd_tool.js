/**
 * PhD 论文绘图助手 - 测试插件
 * 功能：一键将选中元素格式化为 SCI 标准
 */
Draw.loadPlugin(function(ui) {
    // 1. 在菜单栏增加“科研助手”主菜单
    ui.menubar.addMenu('科研助手', function(menu, parent) {
        ui.menus.addItem('一键格式化 (SCI标准)', null, function() {
            var graph = ui.editor.graph;
            var cells = graph.getSelectionCells();
            
            if (cells.length > 0) {
                graph.getModel().beginUpdate();
                try {
                    for (var i = 0; i < cells.length; i++) {
                        // 强制修改样式：字体、大小、线条颜色
                        graph.setCellStyles('fontFamily', 'Times New Roman', [cells[i]]);
                        graph.setCellStyles('fontSize', '12', [cells[i]]);
                        graph.setCellStyles('strokeColor', '#000000', [cells[i]]);
                        graph.setCellStyles('fontColor', '#000000', [cells[i]]);
                    }
                } finally {
                    graph.getModel().endUpdate();
                }
            } else {
                mxUtils.alert('请先选中一些形状再点击！');
            }
        }, parent);
    });
});
