// 全局变量
let vehicles = [];
let currentVehicleId = null;
let charts = {};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadVehicles();
    
    // 点击页面其他地方时关闭菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.vehicle-menu') && !e.target.closest('.record-menu') && !e.target.closest('.expense-menu')) {
            document.querySelectorAll('.menu-dropdown').forEach(menu => {
                menu.style.display = 'none';
            });
        }
    });
});

// 加载所有车辆
async function loadVehicles() {
    try {
        const response = await fetch('/api/vehicles');
        vehicles = await response.json();
        renderVehicles();
    } catch (error) {
        console.error('加载车辆失败:', error);
    }
}

// 渲染车辆列表
function renderVehicles() {
    const container = document.getElementById('vehiclesList');
    if (vehicles.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">暂无车辆，请添加车辆</p>';
        return;
    }

    container.innerHTML = vehicles.map(vehicle => `
        <div class="vehicle-item ${currentVehicleId === vehicle.id ? 'active' : ''}" 
             onclick="selectVehicle(${vehicle.id})">
            <div class="vehicle-content">
                <h3>${escapeHtml(vehicle.name)}</h3>
                <p>当前里程：${vehicle.current_mileage.toFixed(1)} 公里</p>
                <p>创建时间：${formatDate(vehicle.created_at)}</p>
            </div>
            <div class="vehicle-menu" onclick="event.stopPropagation()">
                <button class="menu-btn" onclick="toggleVehicleMenu(${vehicle.id})">⋯</button>
                <div class="menu-dropdown" id="menu-${vehicle.id}" style="display: none;">
                    <button class="menu-item" onclick="deleteVehicle(${vehicle.id})">删除车辆</button>
                </div>
            </div>
        </div>
    `).join('');
}

// 切换车辆菜单
function toggleVehicleMenu(vehicleId) {
    // 关闭所有其他菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        if (menu.id !== `menu-${vehicleId}`) {
            menu.style.display = 'none';
        }
    });
    
    // 切换当前菜单
    const menu = document.getElementById(`menu-${vehicleId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// 选择车辆
function selectVehicle(vehicleId) {
    currentVehicleId = vehicleId;
    renderVehicles();
    document.getElementById('refuelSection').style.display = 'block';
    document.getElementById('expenseSection').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';
    
    // 销毁所有现有图表
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    charts = {};
    
    loadVehicleRecords();
    loadExtraExpenses();
    loadVehicleStats();
    
    // 关闭所有菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });
}

// 刷新统计
function refreshStats() {
    if (!currentVehicleId) {
        return;
    }
    
    // 销毁所有现有图表
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    charts = {};
    
    loadVehicleStats();
    loadVehicleRecords();
    loadExtraExpenses();
}

// 显示添加车辆模态框
function showAddVehicleModal() {
    document.getElementById('addVehicleModal').style.display = 'block';
    document.getElementById('addVehicleForm').reset();
}

// 添加车辆
async function addVehicle(event) {
    event.preventDefault();
    const name = document.getElementById('vehicleName').value.trim();
    const mileage = parseFloat(document.getElementById('vehicleMileage').value);

    if (!name || isNaN(mileage)) {
        return;
    }

    try {
        const response = await fetch('/api/vehicles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, current_mileage: mileage })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addVehicleModal');
            loadVehicles();
        } else {
            console.error('添加失败：', result.error);
        }
    } catch (error) {
        console.error('添加车辆失败:', error);
    }
}

// 删除车辆
async function deleteVehicle(vehicleId) {
    if (!confirm('确定要删除这辆车吗？这将同时删除所有相关的加油记录！')) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${vehicleId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (response.ok) {
            if (currentVehicleId === vehicleId) {
                currentVehicleId = null;
                document.getElementById('refuelSection').style.display = 'none';
                document.getElementById('statsSection').style.display = 'none';
            }
            loadVehicles();
        } else {
            console.error('删除失败：', result.error);
        }
    } catch (error) {
        console.error('删除车辆失败:', error);
    }
}

// 加载车辆加油记录
async function loadVehicleRecords() {
    if (!currentVehicleId) return;

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await response.json();
        renderRecords(records);
    } catch (error) {
        console.error('加载记录失败:', error);
        alert('加载记录失败，请重试');
    }
}

// 渲染加油记录列表
function renderRecords(records) {
    const container = document.getElementById('recordsList');
    if (records.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">暂无加油记录</p>';
        return;
    }

    // 按里程数从低到高排序，用于计算油耗
    const sortedByMileage = [...records].sort((a, b) => a.mileage - b.mileage);
    
    // 创建里程到记录的映射
    const mileageMap = new Map();
    sortedByMileage.forEach((r, i) => {
        mileageMap.set(r.id, i);
    });

    // 按里程数从大到小排序显示（最新最大的在上面）
    const sortedForDisplay = [...records].sort((a, b) => b.mileage - a.mileage);

    // 计算每次的油耗（如果有前一条记录）
    let tableRows = '';
    // 按里程数从大到小排序显示
    for (let i = 0; i < sortedForDisplay.length; i++) {
        const record = sortedForDisplay[i];
        // 检查是否为初始记录（liters或price为null/0/undefined）
        const isInitialRecord = record.liters === null || record.liters === undefined || record.liters === 0 || 
                                record.price === null || record.price === undefined || record.price === 0;
        
        const litersDisplay = isInitialRecord ? '--' : record.liters.toFixed(2);
        const priceDisplay = isInitialRecord ? '--' : `¥${record.price.toFixed(2)}`;
        const pricePerLiter = isInitialRecord ? '--' : `¥${(record.price / record.liters).toFixed(2)}`;
        let fuelConsumption = '-';
        let mileageIncrease = '-';
        
        // 找到当前记录在按里程排序后的位置
        const currentIndex = mileageMap.get(record.id);
        if (currentIndex !== undefined && currentIndex > 0) {
            const prevRecord = sortedByMileage[currentIndex - 1];
            const distance = record.mileage - prevRecord.mileage;
            if (distance > 0) {
                mileageIncrease = distance.toFixed(1);
                if (record.liters && record.liters > 0) {
                    fuelConsumption = (record.liters / distance * 100).toFixed(2);
                }
            }
        }
        
        tableRows += `
            <tr>
                <td>${formatDate(record.refuel_date)}</td>
                <td>${record.mileage.toFixed(1)}</td>
                <td>${mileageIncrease}</td>
                <td>${litersDisplay}</td>
                <td>${priceDisplay}</td>
                <td>${pricePerLiter}</td>
                <td>${fuelConsumption}</td>
                <td class="action-buttons">
                    <div class="record-menu" onclick="event.stopPropagation()">
                        <button class="menu-btn" onclick="toggleRecordMenu(${record.id})">⋯</button>
                        <div class="menu-dropdown" id="record-menu-${record.id}" style="display: none;">
                            <button class="menu-item" onclick="showEditRecordModal(${record.id})">编辑</button>
                            <button class="menu-item menu-item-danger" onclick="deleteRecord(${record.id})">删除</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    container.innerHTML = `
        <table class="records-table">
            <thead>
                <tr>
                    <th>日期</th>
                    <th>里程数 (km)</th>
                    <th>增加里程数 (km)</th>
                    <th>加油量 (L)</th>
                    <th>总价 (元)</th>
                    <th>单价 (元/L)</th>
                    <th>油耗 (L/100km)</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

// 显示添加记录模态框
function showAddRecordModal() {
    if (!currentVehicleId) {
        return;
    }
    document.getElementById('addRecordModal').style.display = 'block';
    document.getElementById('addRecordForm').reset();
    
    // 设置默认日期为当前时间
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('recordDate').value = now.toISOString().slice(0, 16);
    
    // 自动填充当前里程数
    const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
    if (currentVehicle) {
        document.getElementById('recordMileage').value = currentVehicle.current_mileage;
    }
}

// 切换记录菜单
function toggleRecordMenu(recordId) {
    // 关闭所有其他菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        if (menu.id !== `record-menu-${recordId}`) {
            menu.style.display = 'none';
        }
    });
    
    // 切换当前菜单
    const menu = document.getElementById(`record-menu-${recordId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// 添加加油记录
async function addRefuelRecord(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        alert('请先选择车辆');
        return;
    }

    const liters = parseFloat(document.getElementById('recordLiters').value);
    const price = parseFloat(document.getElementById('recordPrice').value);
    const mileage = parseFloat(document.getElementById('recordMileage').value);
    const refuelDate = document.getElementById('recordDate').value;

    if (isNaN(liters) || isNaN(price) || isNaN(mileage) || !refuelDate) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ liters, price, mileage, refuel_date: refuelDate })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addRecordModal');
            loadVehicleRecords();
            loadVehicleStats();
            loadVehicles(); // 更新车辆里程
        } else {
            console.error('添加失败：', result.error);
        }
    } catch (error) {
        console.error('添加记录失败:', error);
    }
}

// 显示编辑记录模态框
async function showEditRecordModal(recordId) {
    if (!currentVehicleId) {
        return;
    }

    // 关闭菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await response.json();
        const record = records.find(r => r.id === recordId);
        
        if (!record) {
            return;
        }

        // 填充表单
        document.getElementById('editRecordId').value = record.id;
        const date = new Date(record.refuel_date);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        document.getElementById('editRecordDate').value = date.toISOString().slice(0, 16);
        document.getElementById('editRecordLiters').value = record.liters || '';
        document.getElementById('editRecordPrice').value = record.price || '';
        document.getElementById('editRecordMileage').value = record.mileage;
        
        document.getElementById('editRecordModal').style.display = 'block';
    } catch (error) {
        console.error('加载记录失败:', error);
    }
}

// 更新加油记录
async function updateRefuelRecord(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        return;
    }

    const recordId = parseInt(document.getElementById('editRecordId').value);
    const liters = parseFloat(document.getElementById('editRecordLiters').value);
    const price = parseFloat(document.getElementById('editRecordPrice').value);
    const mileage = parseFloat(document.getElementById('editRecordMileage').value);
    const refuelDate = document.getElementById('editRecordDate').value;

    if (isNaN(liters) || isNaN(price) || isNaN(mileage) || !refuelDate) {
        return;
    }

    try {
        const response = await fetch(`/api/records/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ liters, price, mileage, refuel_date: refuelDate })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('editRecordModal');
            loadVehicleRecords();
            loadVehicleStats();
            loadVehicles(); // 更新车辆里程
        } else {
            console.error('更新失败：', result.error);
        }
    } catch (error) {
        console.error('更新记录失败:', error);
    }
}

// 删除加油记录
async function deleteRecord(recordId) {
    // 关闭菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });

    if (!confirm('确定要删除这条加油记录吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/records/${recordId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (response.ok) {
            loadVehicleRecords();
            loadVehicleStats();
            loadVehicles(); // 更新车辆里程
        } else {
            console.error('删除失败：', result.error);
        }
    } catch (error) {
        console.error('删除记录失败:', error);
    }
}

// 加载车辆统计信息
async function loadVehicleStats() {
    if (!currentVehicleId) return;

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/stats`);
        const stats = await response.json();
        
        // 加载额外消费统计
        const expenseResponse = await fetch(`/api/vehicles/${currentVehicleId}/expense-stats`);
        const expenseStats = await expenseResponse.json();
        
        renderStats(stats, expenseStats);
        
        // 加载图表数据
        const recordsResponse = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await recordsResponse.json();
        renderCharts(records, stats);
    } catch (error) {
        console.error('加载统计失败:', error);
    }
}

// 渲染统计信息
function renderStats(stats, expenseStats) {
    const container = document.getElementById('statsInfo');
    const totalRefuels = stats.total_refuels || 0;
    const totalLiters = parseFloat(stats.total_liters || 0).toFixed(2);
    const fuelCost = parseFloat(stats.total_cost || 0);
    const extraExpenseCost = parseFloat(expenseStats?.total_amount || 0);
    const totalCost = (fuelCost + extraExpenseCost).toFixed(2);
    const avgPrice = parseFloat(stats.avg_price_per_liter || 0).toFixed(2);
    const totalDistance = parseFloat(stats.total_distance || 0).toFixed(1);
    const avgConsumption = parseFloat(stats.avg_fuel_consumption || 0);

    container.innerHTML = `
        <div class="stat-item">
            <div class="label">加油次数</div>
            <div class="value">${totalRefuels}</div>
        </div>
        <div class="stat-item">
            <div class="label">总加油量</div>
            <div class="value">${totalLiters} L</div>
        </div>
        <div class="stat-item">
            <div class="label">加油费用</div>
            <div class="value">¥${fuelCost.toFixed(2)}</div>
        </div>
        <div class="stat-item">
            <div class="label">额外消费</div>
            <div class="value">¥${extraExpenseCost.toFixed(2)}</div>
        </div>
        <div class="stat-item">
            <div class="label">总费用</div>
            <div class="value">¥${totalCost}</div>
        </div>
        <div class="stat-item">
            <div class="label">平均单价</div>
            <div class="value">¥${avgPrice}</div>
        </div>
        <div class="stat-item">
            <div class="label">总里程</div>
            <div class="value">${totalDistance} km</div>
        </div>
        <div class="stat-item">
            <div class="label">平均油耗</div>
            <div class="value">${avgConsumption} L/100km</div>
        </div>
    `;
}

// 渲染图表
function renderCharts(records, stats) {
    console.log('渲染图表，记录数量:', records.length, records);
    
    if (!records || records.length < 1) {
        // 数据不足，显示提示，但保留canvas元素
        const wrappers = document.querySelectorAll('.chart-wrapper');
        wrappers.forEach((wrapper, index) => {
            const canvasId = ['fuelConsumptionChart', 'costChart', 'priceChart'][index];
            if (!wrapper.querySelector('canvas')) {
                wrapper.innerHTML = `<canvas id="${canvasId}"></canvas>`;
            }
            const canvas = wrapper.querySelector('canvas');
            if (canvas) {
                canvas.style.display = 'none';
                if (!wrapper.querySelector('.no-data-message')) {
                    const msg = document.createElement('p');
                    msg.className = 'no-data-message';
                    msg.style.cssText = 'text-align: center; color: #666; padding-top: 100px;';
                    msg.textContent = '需要至少1条记录才能显示图表';
                    wrapper.appendChild(msg);
                }
            }
        });
        return;
    }
    
    // 移除提示信息，显示canvas
    document.querySelectorAll('.chart-wrapper').forEach(wrapper => {
        const msg = wrapper.querySelector('.no-data-message');
        if (msg) {
            msg.remove();
        }
        const canvas = wrapper.querySelector('canvas');
        if (canvas) {
            canvas.style.display = 'block';
        }
    });

    // 按里程数从小到大排序，确保油耗计算正确
    const sortedByMileage = [...records].sort((a, b) => a.mileage - b.mileage);
    
    // 为了保持图表横坐标按日期显示，我们需要创建映射
    // 先按日期排序用于横坐标标签
    const sortedByDate = [...records].sort((a, b) => new Date(a.refuel_date) - new Date(b.refuel_date));
    const allLabels = sortedByDate.map(r => formatDate(r.refuel_date, true));
    
    // 创建ID到日期索引的映射，用于将按里程计算的油耗映射到按日期排序的位置
    const dateIndexMap = new Map();
    sortedByDate.forEach((r, i) => {
        dateIndexMap.set(r.id, i);
    });
    
    const fuelConsumptionData = [];
    const costData = [];
    const priceData = [];
    
    // 初始化数组，长度与记录数相同（按日期索引）
    for (let i = 0; i < records.length; i++) {
        fuelConsumptionData.push(null);
        costData.push(null);
        priceData.push(null);
    }

    // 填充所有有效记录的费用和油价（按日期索引）
    for (let i = 0; i < sortedByDate.length; i++) {
        const record = sortedByDate[i];
        // 如果有价格，显示费用
        if (record.price !== null && record.price !== undefined && record.price > 0) {
            costData[i] = record.price;
        }
        // 如果有加油量和价格，显示单价
        if (record.liters !== null && record.liters !== undefined && record.liters > 0 && 
            record.price !== null && record.price !== undefined && record.price > 0) {
            priceData[i] = parseFloat((record.price / record.liters).toFixed(2));
        }
    }

    // 计算油耗（需要按里程排序，然后映射到日期索引）
    for (let i = 1; i < sortedByMileage.length; i++) {
        const prevRecord = sortedByMileage[i-1];
        const currentRecord = sortedByMileage[i];
        const distance = currentRecord.mileage - prevRecord.mileage;
        
        // 只有当前记录有加油量且里程增加时，才计算油耗
        if (distance > 0 && currentRecord.liters !== null && currentRecord.liters !== undefined && currentRecord.liters > 0) {
            const consumption = (currentRecord.liters / distance * 100).toFixed(2);
            // 找到当前记录在按日期排序中的索引
            const dateIndex = dateIndexMap.get(currentRecord.id);
            if (dateIndex !== undefined) {
                fuelConsumptionData[dateIndex] = parseFloat(consumption);
            }
        }
    }
    
    // 如果没有有效的数据点（比如里程没有增加），也显示提示
    if (fuelConsumptionData.length === 0) {
        const wrappers = document.querySelectorAll('.chart-wrapper');
        wrappers.forEach((wrapper, index) => {
            const canvasId = ['fuelConsumptionChart', 'costChart', 'priceChart'][index];
            if (!wrapper.querySelector('canvas')) {
                wrapper.innerHTML = `<canvas id="${canvasId}"></canvas>`;
            }
            const canvas = wrapper.querySelector('canvas');
            if (canvas) {
                canvas.style.display = 'none';
                if (!wrapper.querySelector('.no-data-message')) {
                    const msg = document.createElement('p');
                    msg.className = 'no-data-message';
                    msg.style.cssText = 'text-align: center; color: #666; padding-top: 100px;';
                    msg.textContent = '需要至少2条记录且里程数递增才能显示图表';
                    wrapper.appendChild(msg);
                }
            }
        });
        return;
    }
    
    // 移除提示信息，显示canvas
    document.querySelectorAll('.chart-wrapper').forEach(wrapper => {
        const msg = wrapper.querySelector('.no-data-message');
        if (msg) {
            msg.remove();
        }
        const canvas = wrapper.querySelector('canvas');
        if (canvas) {
            canvas.style.display = 'block';
        }
    });

    // 确保canvas元素存在
    let fuelCanvas = document.getElementById('fuelConsumptionChart');
    if (!fuelCanvas) {
        const wrapper = document.querySelectorAll('.chart-wrapper')[0];
        if (wrapper) {
            wrapper.innerHTML = '<canvas id="fuelConsumptionChart"></canvas>';
            fuelCanvas = document.getElementById('fuelConsumptionChart');
        }
    }
    if (!fuelCanvas) {
        console.error('无法找到fuelConsumptionChart元素');
        return;
    }
    
    // 油耗图表
    const fuelCtx = fuelCanvas.getContext('2d');
    if (charts.fuelConsumption) {
        charts.fuelConsumption.destroy();
    }
    charts.fuelConsumption = new Chart(fuelCtx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [{
                label: '油耗 (L/100km)',
                data: fuelConsumptionData,
                borderColor: '#2c3e50',
                backgroundColor: 'rgba(44, 62, 80, 0.1)',
                tension: 0.4,
                fill: true,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 5,
                    right: 5,
                    top: 5,
                    bottom: 5
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '油耗趋势',
                    font: {
                        size: 14
                    }
                },
                legend: {
                    display: true,
                    labels: {
                        font: {
                            size: 12
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            size: 10
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'L/100km',
                        font: {
                            size: 12
                        }
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });

    // 确保费用图表容器有canvas元素
    const costChartWrapper = document.getElementById('costChart').parentElement;
    let costCanvas = document.getElementById('costChart');
    if (!costCanvas || costCanvas.tagName !== 'CANVAS') {
        costChartWrapper.innerHTML = '<canvas id="costChart"></canvas>';
        costCanvas = document.getElementById('costChart');
    }
    
    // 费用图表
    const costCtx = costCanvas.getContext('2d');
    if (charts.cost) {
        charts.cost.destroy();
    }
    charts.cost = new Chart(costCtx, {
        type: 'bar',
        data: {
            labels: allLabels,
            datasets: [{
                label: '加油费用 (元)',
                data: costData,
                backgroundColor: 'rgba(52, 73, 94, 0.7)',
                borderColor: '#34495e',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 5,
                    right: 5,
                    top: 5,
                    bottom: 5
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '加油费用',
                    font: {
                        size: 14
                    }
                },
                legend: {
                    display: true,
                    labels: {
                        font: {
                            size: 12
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            size: 10
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '元',
                        font: {
                            size: 12
                        }
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });

    // 确保单价图表canvas元素存在
    let priceCanvas = document.getElementById('priceChart');
    if (!priceCanvas) {
        const wrapper = document.querySelectorAll('.chart-wrapper')[2];
        if (wrapper) {
            wrapper.innerHTML = '<canvas id="priceChart"></canvas>';
            priceCanvas = document.getElementById('priceChart');
        }
    }
    if (!priceCanvas) {
        console.error('无法找到priceChart元素');
        return;
    }
    
    // 单价图表
    const priceCtx = priceCanvas.getContext('2d');
    if (charts.price) {
        charts.price.destroy();
    }
    charts.price = new Chart(priceCtx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [{
                label: '单价 (元/L)',
                data: priceData,
                borderColor: '#7f8c8d',
                backgroundColor: 'rgba(127, 140, 141, 0.1)',
                tension: 0.4,
                fill: true,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 5,
                    right: 5,
                    top: 5,
                    bottom: 5
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '油价趋势',
                    font: {
                        size: 14
                    }
                },
                legend: {
                    display: true,
                    labels: {
                        font: {
                            size: 12
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            size: 10
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: '元/L',
                        font: {
                            size: 12
                        }
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

// 关闭模态框
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// 工具函数：转义HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 工具函数：格式化日期
function formatDate(dateString, short = false) {
    const date = new Date(dateString);
    if (short) {
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 展开图表到全屏
function expandChart(chartId) {
    const chartName = chartId === 'fuelConsumptionChart' ? 'fuelConsumption' : 
                      chartId === 'costChart' ? 'cost' : 'price';
    const chart = charts[chartName];
    
    if (!chart) {
        return;
    }
    
    const modal = document.getElementById('chartModal');
    const canvasContainer = document.getElementById('chartModalCanvas');
    
    // 创建新的canvas用于全屏显示
    canvasContainer.innerHTML = `<canvas id="fullscreen-${chartId}"></canvas>`;
    const fullscreenCanvas = document.getElementById(`fullscreen-${chartId}`);
    const ctx = fullscreenCanvas.getContext('2d');
    
    // 复制图表配置
    const originalConfig = chart.config;
    const config = {
        type: originalConfig.type,
        data: JSON.parse(JSON.stringify(originalConfig.data)),
        options: {
            ...originalConfig.options,
            maintainAspectRatio: false,
            responsive: true,
            plugins: {
                ...originalConfig.options.plugins,
                title: {
                    ...originalConfig.options.plugins.title,
                    display: true
                }
            }
        }
    };
    
    // 创建新图表
    const fullscreenChart = new Chart(ctx, config);
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 保存全屏图表引用以便关闭时销毁
    window.fullscreenChart = fullscreenChart;
}

// 关闭全屏图表
function closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.style.display = 'none';
    
    // 销毁全屏图表
    if (window.fullscreenChart) {
        window.fullscreenChart.destroy();
        window.fullscreenChart = null;
    }
    
    document.getElementById('chartModalCanvas').innerHTML = '';
}

// 加载额外消费记录
async function loadExtraExpenses() {
    if (!currentVehicleId) return;

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/expenses`);
        const expenses = await response.json();
        renderExpenses(expenses);
    } catch (error) {
        console.error('加载消费记录失败:', error);
    }
}

// 渲染额外消费列表
function renderExpenses(expenses) {
    const container = document.getElementById('expensesList');
    if (expenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">暂无消费记录</p>';
        return;
    }

    let tableRows = '';
    for (let i = 0; i < expenses.length; i++) {
        const expense = expenses[i];
        tableRows += `
            <tr>
                <td>${formatDate(expense.expense_date)}</td>
                <td>${escapeHtml(expense.title)}</td>
                <td>¥${expense.amount.toFixed(2)}</td>
                <td class="action-buttons">
                    <div class="record-menu" onclick="event.stopPropagation()">
                        <button class="menu-btn" onclick="toggleExpenseMenu(${expense.id})">⋯</button>
                        <div class="menu-dropdown" id="expense-menu-${expense.id}" style="display: none;">
                            <button class="menu-item" onclick="showEditExpenseModal(${expense.id})">编辑</button>
                            <button class="menu-item menu-item-danger" onclick="deleteExpense(${expense.id})">删除</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    container.innerHTML = `
        <table class="records-table">
            <thead>
                <tr>
                    <th>日期</th>
                    <th>消费标题</th>
                    <th>金额 (元)</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

// 切换消费记录菜单
function toggleExpenseMenu(expenseId) {
    // 关闭所有其他菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        if (menu.id !== `expense-menu-${expenseId}`) {
            menu.style.display = 'none';
        }
    });
    
    // 切换当前菜单
    const menu = document.getElementById(`expense-menu-${expenseId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// 显示添加消费记录模态框
function showAddExpenseModal() {
    if (!currentVehicleId) {
        return;
    }
    document.getElementById('addExpenseModal').style.display = 'block';
    document.getElementById('addExpenseForm').reset();
    
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today;
}

// 添加额外消费记录
async function addExtraExpense(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        return;
    }

    const title = document.getElementById('expenseTitle').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const expenseDate = document.getElementById('expenseDate').value;

    if (!title || isNaN(amount) || !expenseDate) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, amount, expense_date: expenseDate })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addExpenseModal');
            loadExtraExpenses();
        } else {
            console.error('添加失败：', result.error);
        }
    } catch (error) {
        console.error('添加消费记录失败:', error);
    }
}

// 显示编辑消费记录模态框
async function showEditExpenseModal(expenseId) {
    if (!currentVehicleId) {
        return;
    }

    // 关闭菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/expenses`);
        const expenses = await response.json();
        const expense = expenses.find(e => e.id === expenseId);
        
        if (!expense) {
            return;
        }

        // 填充表单
        document.getElementById('editExpenseId').value = expense.id;
        const date = new Date(expense.expense_date);
        document.getElementById('editExpenseDate').value = date.toISOString().split('T')[0];
        document.getElementById('editExpenseTitle').value = expense.title;
        document.getElementById('editExpenseAmount').value = expense.amount;
        
        document.getElementById('editExpenseModal').style.display = 'block';
    } catch (error) {
        console.error('加载消费记录失败:', error);
    }
}

// 更新额外消费记录
async function updateExtraExpense(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        return;
    }

    const expenseId = parseInt(document.getElementById('editExpenseId').value);
    const title = document.getElementById('editExpenseTitle').value.trim();
    const amount = parseFloat(document.getElementById('editExpenseAmount').value);
    const expenseDate = document.getElementById('editExpenseDate').value;

    if (!title || isNaN(amount) || !expenseDate) {
        return;
    }

    try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, amount, expense_date: expenseDate })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('editExpenseModal');
            loadExtraExpenses();
        } else {
            console.error('更新失败：', result.error);
        }
    } catch (error) {
        console.error('更新消费记录失败:', error);
    }
}

// 删除额外消费记录
async function deleteExpense(expenseId) {
    // 关闭菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });

    if (!confirm('确定要删除这条消费记录吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (response.ok) {
            loadExtraExpenses();
        } else {
            console.error('删除失败：', result.error);
        }
    } catch (error) {
        console.error('删除消费记录失败:', error);
    }
}

// 全局变量：当前导入类型
let currentImportType = null;

// 导出加油记录
async function exportRefuelRecords() {
    if (!currentVehicleId) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await response.json();
        
        if (records.length === 0) {
            return;
        }

        // 按里程数从小到大排序
        const sortedRecords = [...records].sort((a, b) => a.mileage - b.mileage);

        // 生成CSV内容，只包含三个关键字段
        const headers = ['里程数(km)', '加油量(L)', '加油价格(元)'];
        const rows = [headers.join(',')];

        for (let i = 0; i < sortedRecords.length; i++) {
            const record = sortedRecords[i];
            
            // 导出所有记录，包括初始记录
            // 对于初始记录，加油量和价格导出为0
            const liters = (record.liters !== null && record.liters !== undefined && record.liters > 0) 
                ? record.liters : 0;
            const price = (record.price !== null && record.price !== undefined && record.price > 0) 
                ? record.price : 0;
            
            const row = [
                record.mileage.toFixed(1),
                liters.toFixed(2),
                price.toFixed(2)
            ];
            rows.push(row.join(','));
        }

        const csvContent = rows.join('\n');
        exportToCSV(csvContent, `加油记录_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (error) {
        console.error('导出失败:', error);
    }
}

// 导出额外消费记录
async function exportExpenses() {
    if (!currentVehicleId) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/expenses`);
        const expenses = await response.json();
        
        if (expenses.length === 0) {
            return;
        }

        // 按日期排序
        expenses.sort((a, b) => new Date(a.expense_date) - new Date(b.expense_date));

        // 生成CSV内容
        const headers = ['日期', '消费标题', '金额(元)'];
        const rows = [headers.join(',')];

        for (let i = 0; i < expenses.length; i++) {
            const expense = expenses[i];
            const row = [
                formatDate(expense.expense_date),
                `"${expense.title.replace(/"/g, '""')}"`,
                expense.amount.toFixed(2)
            ];
            rows.push(row.join(','));
        }

        const csvContent = rows.join('\n');
        exportToCSV(csvContent, `额外消费_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (error) {
        console.error('导出失败:', error);
    }
}

// 导出到CSV文件或剪切板
function exportToCSV(csvContent, filename) {
    // 提供两个选项：下载文件或复制到剪切板
    const choice = confirm('选择导出方式：\n确定 = 下载文件\n取消 = 复制到剪切板');
    
    if (choice) {
        // 下载文件
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        // 复制到剪切板
        navigator.clipboard.writeText(csvContent).then(() => {
            // 静默复制，不显示提示
        }).catch(err => {
            console.error('复制失败:', err);
        });
    }
}

// 显示导入模态框
function showImportModal(type) {
    if (!currentVehicleId) {
        return;
    }
    
    currentImportType = type;
    const title = type === 'refuel' ? '导入加油记录' : '导入额外消费';
    document.getElementById('importModalTitle').textContent = title;
    document.getElementById('importDataText').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('importModal').style.display = 'block';
}

// 从剪切板粘贴
async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('importDataText').value = text;
        previewImportData(text);
    } catch (error) {
        console.error('读取剪切板失败:', error);
        alert('无法读取剪切板，请手动粘贴数据');
    }
}

// 处理文件导入
function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        document.getElementById('importDataText').value = content;
        previewImportData(content);
    };
    reader.readAsText(file);
}

// 预览导入数据
function previewImportData(text) {
    const lines = text.trim().split('\n').slice(0, 6);
    document.getElementById('importPreviewContent').textContent = lines.join('\n');
    document.getElementById('importPreview').style.display = 'block';
}

// 处理导入
async function processImport() {
    if (!currentVehicleId || !currentImportType) {
        return;
    }

    const text = document.getElementById('importDataText').value.trim();
    if (!text) {
        return;
    }

    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        return;
    }

    try {
        if (currentImportType === 'refuel') {
            await importRefuelRecords(lines);
        } else {
            await importExpenses(lines);
        }
        
        closeModal('importModal');
    } catch (error) {
        console.error('导入失败:', error);
    }
}

// 导入加油记录
async function importRefuelRecords(lines) {
    // 跳过表头
    const dataLines = lines.slice(1);
    let successCount = 0;
    let failCount = 0;

    for (const line of dataLines) {
        const values = parseCSVLine(line);
        if (values.length < 3) continue;

        try {
            // 解析数据：只解析三个关键字段 - 里程数(km), 加油量(L), 加油价格(元)
            const mileage = parseFloat(values[0]);
            const liters = parseFloat(values[1]);
            const price = parseFloat(values[2]);

            if (isNaN(mileage) || isNaN(liters) || isNaN(price)) continue;
            if (mileage <= 0) continue;
            
            // 允许导入初始记录（加油量和价格为0的情况）
            // 对于初始记录，将null值传给API（API会正确处理）
            const litersValue = (liters > 0) ? liters : 0;
            const priceValue = (price > 0) ? price : 0;

            // 使用当前日期时间作为加油日期
            const refuelDate = new Date().toISOString();

            const response = await fetch(`/api/vehicles/${currentVehicleId}/records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    liters: litersValue,
                    price: priceValue,
                    mileage: mileage,
                    refuel_date: refuelDate
                })
            });

            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
        }
    }

    // 刷新数据
    loadVehicleRecords();
    loadVehicleStats();
    loadVehicles();
}

// 导入额外消费记录
async function importExpenses(lines) {
    // 跳过表头
    const dataLines = lines.slice(1);
    let successCount = 0;
    let failCount = 0;

    for (const line of dataLines) {
        const values = parseCSVLine(line);
        if (values.length < 3) continue;

        try {
            const dateStr = values[0].trim();
            const title = values[1].replace(/^"|"$/g, '').trim();
            const amount = parseFloat(values[2].replace('¥', ''));

            if (!title || isNaN(amount)) continue;

            // 转换日期格式
            let expenseDate;
            if (dateStr.includes('-')) {
                expenseDate = new Date(dateStr).toISOString().split('T')[0];
            } else {
                expenseDate = new Date().toISOString().split('T')[0];
            }

            const response = await fetch(`/api/vehicles/${currentVehicleId}/expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    amount: amount,
                    expense_date: expenseDate
                })
            });

            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
        }
    }

    // 刷新数据
    loadExtraExpenses();
}

// 解析CSV行（处理引号内的逗号）
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    
    return values;
}

// 清空加油记录
async function clearRefuelRecords() {
    if (!currentVehicleId) {
        return;
    }

    // 强提示：需要输入确认文字
    const confirmText = prompt('⚠️ 警告：此操作将删除该车辆的所有加油记录（包括初始记录）！\n\n请输入"清空"以确认：');
    
    if (confirmText !== '清空') {
        return;
    }

    // 二次确认
    if (!confirm('⚠️ 最后确认：确定要清空所有加油记录吗？此操作不可恢复！')) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (response.ok) {
            loadVehicleRecords();
            loadVehicleStats();
            loadVehicles();
        } else {
            console.error('清空失败：', result.error);
        }
    } catch (error) {
        console.error('清空记录失败:', error);
    }
}

// 清空额外消费记录
async function clearExpenses() {
    if (!currentVehicleId) {
        return;
    }

    // 强提示：需要输入确认文字
    const confirmText = prompt('⚠️ 警告：此操作将删除该车辆的所有额外消费记录！\n\n请输入"清空"以确认：');
    
    if (confirmText !== '清空') {
        return;
    }

    // 二次确认
    if (!confirm('⚠️ 最后确认：确定要清空所有额外消费记录吗？此操作不可恢复！')) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/expenses`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (response.ok) {
            loadExtraExpenses();
            loadVehicleStats();
        } else {
            console.error('清空失败：', result.error);
        }
    } catch (error) {
        console.error('清空记录失败:', error);
    }
}
