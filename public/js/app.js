// 全局变量
let vehicles = [];
let currentVehicleId = null;
let charts = {};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadVehicles();
    
    // 点击页面其他地方时关闭菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.vehicle-menu')) {
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
        alert('加载车辆失败，请刷新页面重试');
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
    document.getElementById('statsSection').style.display = 'block';
    loadVehicleRecords();
    loadVehicleStats();
    
    // 关闭所有菜单
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });
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
        alert('请填写完整的车辆信息');
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
            alert('车辆添加成功！');
        } else {
            alert('添加失败：' + result.error);
        }
    } catch (error) {
        console.error('添加车辆失败:', error);
        alert('添加车辆失败，请重试');
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
            alert('车辆删除成功！');
        } else {
            alert('删除失败：' + result.error);
        }
    } catch (error) {
        console.error('删除车辆失败:', error);
        alert('删除车辆失败，请重试');
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

    // 计算每次的油耗（如果有前一条记录）
    let tableRows = '';
    // records 已经是按日期从新到旧排序的（API返回）
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const pricePerLiter = (record.price / record.liters).toFixed(2);
        let fuelConsumption = '-';
        
        // 找到当前记录在按里程排序后的位置
        const currentIndex = mileageMap.get(record.id);
        if (currentIndex !== undefined && currentIndex > 0) {
            const prevRecord = sortedByMileage[currentIndex - 1];
            const distance = record.mileage - prevRecord.mileage;
            if (distance > 0) {
                fuelConsumption = (record.liters / distance * 100).toFixed(2);
            }
        }
        
        tableRows += `
            <tr>
                <td>${formatDate(record.refuel_date)}</td>
                <td>${record.mileage.toFixed(1)}</td>
                <td>${record.liters.toFixed(2)}</td>
                <td>¥${record.price.toFixed(2)}</td>
                <td>¥${pricePerLiter}</td>
                <td>${fuelConsumption}</td>
            </tr>
        `;
    }

    container.innerHTML = `
        <table class="records-table">
            <thead>
                <tr>
                    <th>日期</th>
                    <th>里程数 (km)</th>
                    <th>加油量 (L)</th>
                    <th>总价 (元)</th>
                    <th>单价 (元/L)</th>
                    <th>油耗 (L/100km)</th>
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
        alert('请先选择车辆');
        return;
    }
    document.getElementById('addRecordModal').style.display = 'block';
    document.getElementById('addRecordForm').reset();
    
    // 自动填充当前里程数
    const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
    if (currentVehicle) {
        document.getElementById('recordMileage').value = currentVehicle.current_mileage;
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

    if (isNaN(liters) || isNaN(price) || isNaN(mileage)) {
        alert('请填写完整的加油信息');
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ liters, price, mileage })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addRecordModal');
            loadVehicleRecords();
            loadVehicleStats();
            loadVehicles(); // 更新车辆里程
            alert('加油记录添加成功！');
        } else {
            alert('添加失败：' + result.error);
        }
    } catch (error) {
        console.error('添加记录失败:', error);
        alert('添加记录失败，请重试');
    }
}

// 加载车辆统计信息
async function loadVehicleStats() {
    if (!currentVehicleId) return;

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/stats`);
        const stats = await response.json();
        renderStats(stats);
        
        // 加载图表数据
        const recordsResponse = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await recordsResponse.json();
        renderCharts(records, stats);
    } catch (error) {
        console.error('加载统计失败:', error);
    }
}

// 渲染统计信息
function renderStats(stats) {
    const container = document.getElementById('statsInfo');
    const totalRefuels = stats.total_refuels || 0;
    const totalLiters = parseFloat(stats.total_liters || 0).toFixed(2);
    const totalCost = parseFloat(stats.total_cost || 0).toFixed(2);
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
    if (records.length < 2) {
        // 数据不足，显示提示
        document.querySelectorAll('.chart-wrapper').forEach(wrapper => {
            wrapper.innerHTML = '<p style="text-align: center; color: #666; padding-top: 100px;">需要至少2条记录才能显示图表</p>';
        });
        return;
    }

    // 按日期排序
    records.sort((a, b) => new Date(a.refuel_date) - new Date(b.refuel_date));

    // 计算每次的油耗（L/100km）
    const fuelConsumptionData = [];
    const labels = [];
    const costData = [];
    const priceData = [];

    for (let i = 1; i < records.length; i++) {
        const distance = records[i].mileage - records[i-1].mileage;
        if (distance > 0) {
            const consumption = (records[i].liters / distance * 100).toFixed(2);
            fuelConsumptionData.push(parseFloat(consumption));
            labels.push(formatDate(records[i].refuel_date, true));
            costData.push(records[i].price);
            priceData.push((records[i].price / records[i].liters).toFixed(2));
        }
    }

    // 油耗图表
    const fuelCtx = document.getElementById('fuelConsumptionChart').getContext('2d');
    if (charts.fuelConsumption) {
        charts.fuelConsumption.destroy();
    }
    charts.fuelConsumption = new Chart(fuelCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '油耗 (L/100km)',
                data: fuelConsumptionData,
                borderColor: '#2c3e50',
                backgroundColor: 'rgba(44, 62, 80, 0.1)',
                tension: 0.4,
                fill: true
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

    // 费用图表
    const costCtx = document.getElementById('costChart').getContext('2d');
    if (charts.cost) {
        charts.cost.destroy();
    }
    charts.cost = new Chart(costCtx, {
        type: 'bar',
        data: {
            labels: labels,
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

    // 单价图表
    const priceCtx = document.getElementById('priceChart').getContext('2d');
    if (charts.price) {
        charts.price.destroy();
    }
    charts.price = new Chart(priceCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '单价 (元/L)',
                data: priceData,
                borderColor: '#7f8c8d',
                backgroundColor: 'rgba(127, 140, 141, 0.1)',
                tension: 0.4,
                fill: true
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


