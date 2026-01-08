// 全局变量
let vehicles = [];
let currentVehicleId = null;
let charts = {};
let unlockedVehicles = new Set();

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

function renderVehicles() {
    const container = document.getElementById('vehiclesList');
    if (vehicles.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">暂无车辆，请添加车辆</p>';
        return;
    }

    container.innerHTML = vehicles.map(vehicle => {
        const isSelected = currentVehicleId === vehicle.id;
        const isUnlocked = unlockedVehicles.has(vehicle.id);
        const lockIcon = vehicle.password ? (isUnlocked ? ' 🔓' : ' 🔒') : '';

        // 根据是否有密码和是否解锁来显示不同的菜单项
        let passwordMenuItem = '';
        if (vehicle.password) {
            if (isUnlocked) {
                // 如果已解锁，显示“重新加锁”和“更改密码”
                passwordMenuItem = `
                    <button class="menu-item" onclick="lockVehicle(${vehicle.id})">重新加锁</button>
                    <button class="menu-item" onclick="showSetPasswordModal(${vehicle.id})">更改密码</button>
                `;
            } else {
                // 如果未解锁，只显示“更改密码”（虽然正常需要解锁才能改，但逻辑上先放着）
                passwordMenuItem = `<button class="menu-item" onclick="showSetPasswordModal(${vehicle.id})">更改密码</button>`;
            }
        } else {
            // 没有密码，显示“设置密码”
            passwordMenuItem = `<button class="menu-item" onclick="showSetPasswordModal(${vehicle.id})">设置密码</button>`;
        }

        return `
            <div class="vehicle-item ${isSelected ? 'active' : ''}" 
                 onclick="selectVehicle(${vehicle.id})">
                <div class="vehicle-content">
                    <h3>${escapeHtml(vehicle.name)}${lockIcon}</h3>
                    <p>当前里程：${vehicle.current_mileage.toFixed(1)} 公里</p>
                    <p>创建时间：${formatDate(vehicle.created_at)}</p>
                </div>
                <div class="vehicle-menu" onclick="event.stopPropagation()">
                    <button class="menu-btn" onclick="toggleVehicleMenu(${vehicle.id})">⋯</button>
                    <div class="menu-dropdown" id="menu-${vehicle.id}" style="display: none;">
                        ${passwordMenuItem}
                        <button class="menu-item menu-item-danger" onclick="deleteVehicle(${vehicle.id})">删除车辆</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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
async function selectVehicle(vehicleId) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;

    // 如果有密码且未解锁
    if (vehicle.password && !unlockedVehicles.has(vehicleId)) {
        // 尝试从 localStorage 获取密码并验证
        const savedPasswords = JSON.parse(localStorage.getItem('vehicle_passwords') || '{}');
        const savedPwd = savedPasswords[vehicleId];

        if (savedPwd) {
            try {
                const response = await fetch(`/api/vehicles/${vehicleId}/verify-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: savedPwd })
                });

                if (response.ok) {
                    unlockedVehicles.add(vehicleId);
                } else {
                    // 如果保存的密码失效了，从本地删除并显示解锁框
                    delete savedPasswords[vehicleId];
                    localStorage.setItem('vehicle_passwords', JSON.stringify(savedPasswords));
                    showUnlockModal(vehicleId);
                    return;
                }
            } catch (error) {
                console.error('自动解锁失败:', error);
                showUnlockModal(vehicleId);
                return;
            }
        } else {
            showUnlockModal(vehicleId);
            return;
        }
    }

    currentVehicleId = vehicleId;
    renderVehicles();
    document.getElementById('refuelSection').style.display = 'block';
    document.getElementById('expenseSection').style.display = 'block';
    document.getElementById('maintenanceSection').style.display = 'block';
    document.getElementById('statsSection').style.display = 'block';

    // 手机端自动滚动到加油记录
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            document.getElementById('refuelSection').scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    // 销毁所有现有图表
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    charts = {};

    loadVehicleRecords();
    loadExtraExpenses();
    loadMaintenanceData();
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
    loadMaintenanceData();
}

// 显示添加车辆模态框
function showAddVehicleModal() {
    document.getElementById('addVehicleModal').style.display = 'block';
    document.getElementById('addVehicleForm').reset();
}

// 显示新建车辆并导入数据模态框
function showImportForNewVehicle() {
    closeModal('addVehicleModal');
    document.getElementById('importForNewVehicleModal').style.display = 'block';
    document.getElementById('newVehicleNameForImport').value = '';
    document.getElementById('importDataTextForNewVehicle').value = '';
    document.getElementById('importPreviewForNewVehicle').style.display = 'none';
}

// 从剪切板粘贴（新建车辆）
async function pasteFromClipboardForNewVehicle() {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('importDataTextForNewVehicle').value = text;
        previewImportDataForNewVehicle(text);
    } catch (error) {
        console.error('读取剪切板失败:', error);
        alert('无法读取剪切板，请手动粘贴数据');
    }
}

// 处理文件导入（新建车辆）
function handleFileImportForNewVehicle(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        document.getElementById('importDataTextForNewVehicle').value = content;
        previewImportDataForNewVehicle(content);
    };
    reader.readAsText(file);
}

// 预览导入数据（新建车辆）
function previewImportDataForNewVehicle(text) {
    const lines = text.trim().split('\n').slice(0, 6);
    document.getElementById('importPreviewContentForNewVehicle').textContent = lines.join('\n');
    document.getElementById('importPreviewForNewVehicle').style.display = 'block';
}

// 处理新建车辆并导入数据
async function processImportForNewVehicle() {
    const vehicleName = document.getElementById('newVehicleNameForImport').value.trim();
    if (!vehicleName) {
        alert('请输入车辆名称');
        return;
    }

    const text = document.getElementById('importDataTextForNewVehicle').value.trim();
    if (!text) {
        alert('请输入或导入CSV数据');
        return;
    }

    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        alert('数据不足，至少需要表头和一条数据');
        return;
    }

    try {
        // 解析CSV数据
        const dataLines = lines.slice(1); // 跳过表头
        const records = [];
        let minMileage = Infinity;

        for (const line of dataLines) {
            const values = parseCSVLine(line);
            if (values.length < 3) continue;

            const mileage = parseFloat(values[0]);
            const liters = parseFloat(values[1]);
            const price = parseFloat(values[2]);

            if (isNaN(mileage) || mileage <= 0) continue;
            if (isNaN(liters) || isNaN(price)) continue;

            // 允许初始记录（加油量和价格为0）
            const litersValue = (liters > 0) ? liters : 0;
            const priceValue = (price > 0) ? price : 0;

            // 找到最小里程数作为初始里程
            if (mileage < minMileage) {
                minMileage = mileage;
            }

            records.push({ mileage, liters: litersValue, price: priceValue });
        }

        if (records.length === 0) {
            alert('没有有效的记录数据');
            return;
        }

        if (minMileage === Infinity) {
            alert('无法确定初始里程数');
            return;
        }

        // 创建车辆
        const vehicleResponse = await fetch('/api/vehicles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: vehicleName,
                current_mileage: minMileage
            })
        });

        const vehicleResult = await vehicleResponse.json();
        if (!vehicleResponse.ok) {
            alert('创建车辆失败：' + (vehicleResult.error || '未知错误'));
            return;
        }

        const vehicleId = vehicleResult.id;

        // 删除自动创建的初始记录（因为我们要导入自己的数据）
        // 先获取初始记录ID
        const recordsResponse = await fetch(`/api/vehicles/${vehicleId}/records`);
        const existingRecords = await recordsResponse.json();
        if (existingRecords.length > 0) {
            // 删除初始记录（查找liters和price都为null或0的记录）
            const initialRecord = existingRecords.find(r =>
                (r.liters === null || r.liters === 0 || r.liters === undefined) &&
                (r.price === null || r.price === 0 || r.price === undefined)
            );
            if (initialRecord) {
                await fetch(`/api/records/${initialRecord.id}`, {
                    method: 'DELETE'
                });
            }
        }

        // 按里程数从小到大排序记录（确保初始记录先导入）
        records.sort((a, b) => a.mileage - b.mileage);

        // 导入所有记录
        let successCount = 0;
        let failCount = 0;

        for (const record of records) {
            try {
                const response = await fetch(`/api/vehicles/${vehicleId}/records`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        liters: record.liters,
                        price: record.price,
                        mileage: record.mileage,
                        refuel_date: new Date().toISOString()
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

        closeModal('importForNewVehicleModal');

        // 刷新数据并选择新创建的车辆
        await loadVehicles();
        selectVehicle(vehicleId);

        if (failCount > 0) {
            alert(`导入完成：成功 ${successCount} 条，失败 ${failCount} 条`);
        } else {
            alert(`导入成功：共 ${successCount} 条记录`);
        }
    } catch (error) {
        console.error('导入失败:', error);
        alert('导入失败：' + error.message);
    }
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

// 刷新加油记录（重新加载并重新计算）
async function refreshRefuelRecords() {
    if (!currentVehicleId) return;

    try {
        // 重新加载记录（会按里程数排序并重新计算所有数值）
        await loadVehicleRecords();
        // 重新加载统计信息
        await loadVehicleStats();
        // 重新加载车辆信息（更新里程）
        await loadVehicles();
    } catch (error) {
        console.error('刷新记录失败:', error);
        alert('刷新失败，请重试');
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
        let costPerKm = '-';

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
                // 计算每公里费用：总价 / 增加里程数
                if (record.price && record.price > 0) {
                    costPerKm = `¥${(record.price / distance).toFixed(2)}`;
                }
            }
        }

        const imageCell = record.image_path
            ? `<td><img src="${record.image_path}" alt="记录图片" style="max-width: 80px; max-height: 80px; border-radius: 4px; cursor: pointer;" onclick="showImageModal('${record.image_path}')"></td>`
            : '<td>--</td>';

        tableRows += `
            <tr>
                <td>${formatDate(record.refuel_date)}</td>
                <td>${record.mileage.toFixed(1)}</td>
                <td>${mileageIncrease}</td>
                <td>${litersDisplay}</td>
                <td>${priceDisplay}</td>
                <td>${pricePerLiter}</td>
                <td>${fuelConsumption}</td>
                <td>${costPerKm}</td>
                ${imageCell}
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
                    <th>每公里费用 (元/km)</th>
                    <th>图片</th>
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

    // 重置输入模式为加油量
    setRecordInputMode('add', 'liters');

    // 清空图片
    removeImage('add', 'record');

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

// 设置记录输入模式（加油量/单价）
function setRecordInputMode(mode, inputMode) {
    // 处理ID命名不一致问题：添加模式的输入框没有'add'前缀，但按钮和标签有
    const prefix = mode === 'add' ? 'add' : 'edit';
    const inputPrefix = mode === 'add' ? '' : 'edit';
    const litersBtn = document.getElementById(`${prefix}RecordModeLiters`);
    const pricePerLiterBtn = document.getElementById(`${prefix}RecordModePricePerLiter`);
    const inputLabel = document.getElementById(`${prefix}RecordInputLabel`);
    const inputValue = document.getElementById(`${inputPrefix}RecordInputValue`);
    const hiddenMode = document.getElementById(`${inputPrefix}RecordInputMode`);
    const calculatedValue = document.getElementById(`${prefix}RecordCalculatedValue`);
    const priceInput = document.getElementById(`${inputPrefix}RecordPrice`);

    // 更新按钮状态
    if (inputMode === 'liters') {
        litersBtn.classList.add('toggle-btn-active');
        pricePerLiterBtn.classList.remove('toggle-btn-active');
        inputLabel.textContent = '加油升数（L）：';
        inputValue.placeholder = '例如：50.5';
    } else {
        litersBtn.classList.remove('toggle-btn-active');
        pricePerLiterBtn.classList.add('toggle-btn-active');
        inputLabel.textContent = '单价（元/L）：';
        inputValue.placeholder = '例如：7.50';
    }

    // 更新隐藏的mode值
    hiddenMode.value = inputMode;

    // 清空输入值
    inputValue.value = '';

    // 隐藏计算结果
    calculatedValue.style.display = 'none';
    calculatedValue.querySelector('span').textContent = '';

    // 如果有总价，重新计算
    if (priceInput && priceInput.value) {
        calculateRecordValues(mode);
    }
}

// 计算记录值（根据输入模式）
function calculateRecordValues(mode) {
    // 处理ID命名不一致问题：添加模式的输入框没有'add'前缀，但计算结果div有
    const prefix = mode === 'add' ? 'add' : 'edit';
    const inputPrefix = mode === 'add' ? '' : 'edit';
    const priceInput = document.getElementById(`${inputPrefix}RecordPrice`);
    const inputValue = document.getElementById(`${inputPrefix}RecordInputValue`);
    const hiddenMode = document.getElementById(`${inputPrefix}RecordInputMode`);
    const calculatedValue = document.getElementById(`${prefix}RecordCalculatedValue`);
    const calculatedText = document.getElementById(`${prefix}RecordCalculatedText`);
    const inputMode = hiddenMode ? hiddenMode.value : 'liters';

    const price = parseFloat(priceInput.value);

    if (isNaN(price) || price <= 0) {
        calculatedValue.style.display = 'none';
        return;
    }

    if (inputMode === 'liters') {
        // 输入加油量，计算单价
        const liters = parseFloat(inputValue.value);
        if (!isNaN(liters) && liters > 0) {
            const pricePerLiter = price / liters;
            calculatedText.textContent = `单价：¥${pricePerLiter.toFixed(2)}/L`;
            calculatedValue.style.display = 'block';
        } else {
            calculatedValue.style.display = 'none';
        }
    } else {
        // 输入单价，计算加油量
        const pricePerLiter = parseFloat(inputValue.value);
        if (!isNaN(pricePerLiter) && pricePerLiter > 0) {
            const liters = price / pricePerLiter;
            calculatedText.textContent = `加油量：${liters.toFixed(2)}L`;
            calculatedValue.style.display = 'block';
        } else {
            calculatedValue.style.display = 'none';
        }
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

    const price = parseFloat(document.getElementById('recordPrice').value);
    const mileage = parseFloat(document.getElementById('recordMileage').value);
    const refuelDate = document.getElementById('recordDate').value;
    const inputValue = parseFloat(document.getElementById('recordInputValue').value);
    const inputMode = document.getElementById('recordInputMode').value || 'liters';

    if (isNaN(price) || isNaN(mileage) || !refuelDate) {
        return;
    }

    if (isNaN(inputValue) || inputValue <= 0) {
        alert(inputMode === 'liters' ? '请输入有效的加油量' : '请输入有效的单价');
        return;
    }

    let liters;
    if (inputMode === 'liters') {
        // 输入的是加油量
        liters = inputValue;
    } else {
        // 输入的是单价，需要计算加油量
        liters = price / inputValue;
    }

    const imagePath = document.getElementById('addRecordImagePath').value;

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ liters, price, mileage, refuel_date: refuelDate, image_path: imagePath || null })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addRecordModal');
            // 清空图片相关
            removeImage('add', 'record');
            loadVehicleRecords();
            loadVehicleStats();
            loadVehicles(); // 更新车辆里程
            loadMaintenanceData(); // 刷新维保模块
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

        // 重置输入模式为加油量模式
        setRecordInputMode('edit', 'liters');

        // 填充表单
        document.getElementById('editRecordId').value = record.id;
        const date = new Date(record.refuel_date);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        document.getElementById('editRecordDate').value = date.toISOString().slice(0, 16);
        document.getElementById('editRecordInputValue').value = record.liters || '';
        document.getElementById('editRecordPrice').value = record.price || '';
        document.getElementById('editRecordMileage').value = record.mileage;

        // 加载图片
        if (record.image_path) {
            document.getElementById('editRecordImagePath').value = record.image_path;
            document.getElementById('editRecordImagePreview').style.display = 'block';
            document.getElementById('editRecordImagePreviewImg').src = record.image_path;
        } else {
            document.getElementById('editRecordImagePath').value = '';
            document.getElementById('editRecordImagePreview').style.display = 'none';
        }

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
    const price = parseFloat(document.getElementById('editRecordPrice').value);
    const mileage = parseFloat(document.getElementById('editRecordMileage').value);
    const refuelDate = document.getElementById('editRecordDate').value;
    const inputValue = parseFloat(document.getElementById('editRecordInputValue').value);
    const inputMode = document.getElementById('editRecordInputMode').value || 'liters';

    if (isNaN(price) || isNaN(mileage) || !refuelDate) {
        return;
    }

    if (isNaN(inputValue) || inputValue <= 0) {
        alert(inputMode === 'liters' ? '请输入有效的加油量' : '请输入有效的单价');
        return;
    }

    let liters;
    if (inputMode === 'liters') {
        // 输入的是加油量
        liters = inputValue;
    } else {
        // 输入的是单价，需要计算加油量
        liters = price / inputValue;
    }

    const imagePath = document.getElementById('editRecordImagePath').value;

    try {
        const response = await fetch(`/api/records/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ liters, price, mileage, refuel_date: refuelDate, image_path: imagePath || null })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('editRecordModal');
            loadVehicleRecords();
            loadVehicleStats();
            loadVehicles(); // 更新车辆里程
            loadMaintenanceData(); // 刷新维保模块
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
            loadMaintenanceData(); // 刷新维保模块
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
        const prevRecord = sortedByMileage[i - 1];
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
window.onclick = function (event) {
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
        const imageCell = expense.image_path
            ? `<td><img src="${expense.image_path}" alt="记录图片" style="max-width: 80px; max-height: 80px; border-radius: 4px; cursor: pointer;" onclick="showImageModal('${expense.image_path}')"></td>`
            : '<td>--</td>';

        tableRows += `
            <tr>
                <td>${formatDate(expense.expense_date)}</td>
                <td>${escapeHtml(expense.title)}</td>
                <td>¥${expense.amount.toFixed(2)}</td>
                ${imageCell}
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
                    <th>描述</th>
                    <th>金额 (元)</th>
                    <th>图片</th>
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

    // 清空图片
    removeImage('add', 'expense');

    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today;
    document.getElementById('expenseTitle').value = '';
}

// 添加额外消费记录
async function addExtraExpense(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        return;
    }

    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const expenseDate = document.getElementById('expenseDate').value;

    if (isNaN(amount) || !expenseDate) {
        return;
    }

    const title = document.getElementById('expenseTitle').value.trim() || '消费';
    const imagePath = document.getElementById('addExpenseImagePath').value;

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, amount, expense_date: expenseDate, image_path: imagePath || null })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addExpenseModal');
            removeImage('add', 'expense');
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
        document.getElementById('editExpenseAmount').value = expense.amount;
        document.getElementById('editExpenseTitle').value = expense.title || '';

        // 加载图片
        if (expense.image_path) {
            document.getElementById('editExpenseImagePath').value = expense.image_path;
            document.getElementById('editExpenseImagePreview').style.display = 'block';
            document.getElementById('editExpenseImagePreviewImg').src = expense.image_path;
        } else {
            document.getElementById('editExpenseImagePath').value = '';
            document.getElementById('editExpenseImagePreview').style.display = 'none';
        }

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
    const amount = parseFloat(document.getElementById('editExpenseAmount').value);
    const expenseDate = document.getElementById('editExpenseDate').value;

    if (isNaN(amount) || !expenseDate) {
        return;
    }

    const title = document.getElementById('editExpenseTitle').value.trim() || '消费';
    const imagePath = document.getElementById('editExpenseImagePath').value;

    try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, amount, expense_date: expenseDate, image_path: imagePath || null })
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

// 加载维保数据
async function loadMaintenanceData() {
    if (!currentVehicleId) return;

    try {
        // 加载维保提醒
        const alertsResponse = await fetch(`/api/vehicles/${currentVehicleId}/maintenance-alerts`);
        const alerts = await alertsResponse.json();

        // 加载维保设置
        const settingsResponse = await fetch(`/api/vehicles/${currentVehicleId}/maintenance-settings`);
        const settings = await settingsResponse.json();

        // 加载维保记录
        const recordsResponse = await fetch(`/api/vehicles/${currentVehicleId}/maintenance-records`);
        const records = await recordsResponse.json();

        renderMaintenanceAlerts(alerts);
        renderMaintenanceSettings(settings);
        renderMaintenanceRecords(records);
    } catch (error) {
        console.error('加载维保数据失败:', error);
    }
}

// 渲染维保提醒
function renderMaintenanceAlerts(alerts) {
    const container = document.getElementById('maintenanceAlerts');

    if (alerts.length === 0) {
        container.innerHTML = '';
        return;
    }

    let alertsHTML = '';
    for (const alert of alerts) {
        alertsHTML += `
            <div class="maintenance-alert" style="background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: #856404; font-size: 16px;">⚠️ 维保提醒</strong>
                    <p style="margin: 8px 0 0 0; color: #856404;">
                        已经达到 ${alert.interval_km.toFixed(0)}km 维保间隔，需要进行维保${alert.description ? '：' + escapeHtml(alert.description) : ''}
                        ${alert.overdue_km > 0 ? `（已超过 ${alert.overdue_km.toFixed(0)}km）` : ''}
                    </p>
                    <p style="margin: 5px 0 0 0; color: #856404; font-size: 12px;">
                        当前里程：${alert.current_mileage.toFixed(0)}km | 上次维保：${alert.last_maintenance_mileage > 0 ? alert.last_maintenance_mileage.toFixed(0) + 'km' : '无'} | 下次维保：${alert.next_maintenance_mileage.toFixed(0)}km
                    </p>
                </div>
                <button class="btn btn-primary" onclick="showAddMaintenanceRecordModal(${alert.setting_id})">添加记录</button>
            </div>
        `;
    }

    container.innerHTML = alertsHTML;
}

// 渲染维保设置
function renderMaintenanceSettings(settings) {
    const container = document.getElementById('maintenanceSettings');

    if (settings.length === 0) {
        container.innerHTML = '<p style="color: #666; padding: 10px;">暂无维保设置，请点击右上角"设置"按钮添加</p>';
        return;
    }

    let settingsHTML = '<h3 style="margin-bottom: 15px;">维保设置</h3><div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    for (const setting of settings) {
        settingsHTML += `
            <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 15px; display: flex; align-items: center; gap: 10px;">
                <span><strong>${setting.interval_km.toFixed(0)}km</strong> ${setting.description ? ' - ' + escapeHtml(setting.description) : ''}</span>
                <button class="btn-icon" onclick="deleteMaintenanceSetting(${setting.id})" title="删除">×</button>
            </div>
        `;
    }
    settingsHTML += '</div>';

    container.innerHTML = settingsHTML;
}

// 渲染维保记录
function renderMaintenanceRecords(records) {
    const container = document.getElementById('maintenanceRecords');

    if (records.length === 0) {
        container.innerHTML = '<h3 style="margin-bottom: 15px;">维保记录</h3><p style="color: #666; padding: 10px;">暂无维保记录</p>';
        return;
    }

    let tableRows = '';
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const imageCell = record.image_path
            ? `<td><img src="${record.image_path}" alt="记录图片" style="max-width: 80px; max-height: 80px; border-radius: 4px; cursor: pointer;" onclick="showImageModal('${record.image_path}')"></td>`
            : '<td>--</td>';

        tableRows += `
            <tr>
                <td>${formatDate(record.maintenance_date)}</td>
                <td>${record.mileage.toFixed(1)}</td>
                <td>${escapeHtml(record.description || '--')}</td>
                <td>¥${record.amount.toFixed(2)}</td>
                ${imageCell}
                <td class="action-buttons">
                    <div class="record-menu" onclick="event.stopPropagation()">
                        <button class="menu-btn" onclick="toggleMaintenanceMenu(${record.id})">⋯</button>
                        <div class="menu-dropdown" id="maintenance-menu-${record.id}" style="display: none;">
                            <button class="menu-item" onclick="showEditMaintenanceRecordModal(${record.id})">编辑</button>
                            <button class="menu-item menu-item-danger" onclick="deleteMaintenanceRecord(${record.id})">删除</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    container.innerHTML = `
        <h3 style="margin-bottom: 15px;">维保记录</h3>
        <table class="records-table">
            <thead>
                <tr>
                    <th>日期</th>
                    <th>里程数 (km)</th>
                    <th>描述</th>
                    <th>金额 (元)</th>
                    <th>图片</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

// 显示添加维保设置模态框
function showAddMaintenanceSettingModal() {
    if (!currentVehicleId) {
        return;
    }
    document.getElementById('addMaintenanceSettingModal').style.display = 'block';
    document.getElementById('addMaintenanceSettingForm').reset();
}

// 添加维保设置
async function addMaintenanceSetting(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        return;
    }

    const intervalKm = parseFloat(document.getElementById('maintenanceIntervalKm').value);
    const description = document.getElementById('maintenanceSettingDescription').value.trim();

    if (isNaN(intervalKm) || intervalKm <= 0) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/maintenance-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interval_km: intervalKm, description: description || null })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addMaintenanceSettingModal');
            loadMaintenanceData();
        } else {
            console.error('添加失败：', result.error);
            alert('添加失败：' + (result.error || '未知错误'));
        }
    } catch (error) {
        console.error('添加维保设置失败:', error);
    }
}

// 删除维保设置
async function deleteMaintenanceSetting(settingId) {
    if (!confirm('确定要删除这个维保设置吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/maintenance-settings/${settingId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (response.ok) {
            loadMaintenanceData();
        } else {
            console.error('删除失败：', result.error);
        }
    } catch (error) {
        console.error('删除维保设置失败:', error);
    }
}

// 显示添加维保记录模态框
function showAddMaintenanceRecordModal(settingId) {
    if (!currentVehicleId) {
        return;
    }

    // 如果从提醒中点击，保存settingId
    window.currentMaintenanceSettingId = settingId || null;

    document.getElementById('addMaintenanceRecordModal').style.display = 'block';
    document.getElementById('addMaintenanceRecordForm').reset();

    // 清空图片
    removeImage('add', 'maintenanceRecord');

    // 设置默认日期为当前时间
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('maintenanceRecordDate').value = now.toISOString().slice(0, 16);

    // 自动填充当前里程数
    const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
    if (currentVehicle) {
        document.getElementById('maintenanceRecordMileage').value = currentVehicle.current_mileage;
    }
}

// 添加维保记录
async function addMaintenanceRecord(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        return;
    }

    const mileage = parseFloat(document.getElementById('maintenanceRecordMileage').value);
    const description = document.getElementById('maintenanceRecordDescription').value.trim();
    const amount = parseFloat(document.getElementById('maintenanceRecordAmount').value);
    const maintenanceDate = document.getElementById('maintenanceRecordDate').value;

    if (isNaN(mileage) || isNaN(amount) || !maintenanceDate) {
        return;
    }

    const imagePath = document.getElementById('addMaintenanceRecordImagePath').value;

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/maintenance-records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mileage: mileage,
                description: description || null,
                amount: amount,
                maintenance_date: maintenanceDate,
                image_path: imagePath || null
            })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('addMaintenanceRecordModal');
            window.currentMaintenanceSettingId = null;
            removeImage('add', 'maintenanceRecord');
            loadMaintenanceData();
            loadVehicles(); // 刷新车辆信息
        } else {
            console.error('添加失败：', result.error);
            alert('添加失败：' + (result.error || '未知错误'));
        }
    } catch (error) {
        console.error('添加维保记录失败:', error);
    }
}

// 切换维保记录菜单
function toggleMaintenanceMenu(recordId) {
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        if (menu.id !== `maintenance-menu-${recordId}`) {
            menu.style.display = 'none';
        }
    });

    const menu = document.getElementById(`maintenance-menu-${recordId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// 显示编辑维保记录模态框
async function showEditMaintenanceRecordModal(recordId) {
    if (!currentVehicleId) {
        return;
    }

    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/maintenance-records`);
        const records = await response.json();
        const record = records.find(r => r.id === recordId);

        if (!record) {
            return;
        }

        document.getElementById('editMaintenanceRecordId').value = record.id;
        const date = new Date(record.maintenance_date);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        document.getElementById('editMaintenanceRecordDate').value = date.toISOString().slice(0, 16);
        document.getElementById('editMaintenanceRecordMileage').value = record.mileage;
        document.getElementById('editMaintenanceRecordDescription').value = record.description || '';
        document.getElementById('editMaintenanceRecordAmount').value = record.amount;

        // 加载图片
        if (record.image_path) {
            document.getElementById('editMaintenanceRecordImagePath').value = record.image_path;
            document.getElementById('editMaintenanceRecordImagePreview').style.display = 'block';
            document.getElementById('editMaintenanceRecordImagePreviewImg').src = record.image_path;
        } else {
            document.getElementById('editMaintenanceRecordImagePath').value = '';
            document.getElementById('editMaintenanceRecordImagePreview').style.display = 'none';
        }

        document.getElementById('editMaintenanceRecordModal').style.display = 'block';
    } catch (error) {
        console.error('加载记录失败:', error);
    }
}

// 更新维保记录
async function updateMaintenanceRecord(event) {
    event.preventDefault();
    if (!currentVehicleId) {
        return;
    }

    const recordId = parseInt(document.getElementById('editMaintenanceRecordId').value);
    const mileage = parseFloat(document.getElementById('editMaintenanceRecordMileage').value);
    const description = document.getElementById('editMaintenanceRecordDescription').value.trim();
    const amount = parseFloat(document.getElementById('editMaintenanceRecordAmount').value);
    const maintenanceDate = document.getElementById('editMaintenanceRecordDate').value;

    if (isNaN(mileage) || isNaN(amount) || !maintenanceDate) {
        return;
    }

    const imagePath = document.getElementById('editMaintenanceRecordImagePath').value;

    try {
        const response = await fetch(`/api/maintenance-records/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mileage: mileage,
                description: description || null,
                amount: amount,
                maintenance_date: maintenanceDate,
                image_path: imagePath || null
            })
        });

        const result = await response.json();
        if (response.ok) {
            closeModal('editMaintenanceRecordModal');
            loadMaintenanceData();
            loadVehicles();
        } else {
            console.error('更新失败：', result.error);
        }
    } catch (error) {
        console.error('更新维保记录失败:', error);
    }
}

// 删除维保记录
async function deleteMaintenanceRecord(recordId) {
    document.querySelectorAll('.menu-dropdown').forEach(menu => {
        menu.style.display = 'none';
    });

    if (!confirm('确定要删除这条维保记录吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/maintenance-records/${recordId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (response.ok) {
            loadMaintenanceData();
            loadVehicles();
        } else {
            console.error('删除失败：', result.error);
        }
    } catch (error) {
        console.error('删除维保记录失败:', error);
    }
}

// 全局变量：当前导入类型
let currentImportType = null;

// 导出加油记录（显示选择模态框）
async function exportRefuelRecords() {
    if (!currentVehicleId) {
        return;
    }

    // 显示导出选择模态框
    document.getElementById('exportModal').style.display = 'block';
}

// 导出简单CSV（只包含三个关键字段）
async function exportSimpleCSV() {
    if (!currentVehicleId) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await response.json();

        if (records.length === 0) {
            alert('暂无记录可导出');
            closeModal('exportModal');
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

        // 获取当前车辆名称
        const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
        const vehicleName = currentVehicle ? currentVehicle.name : '未知车辆';

        // 清理车辆名称中的特殊字符（Windows文件名不允许的字符）
        const sanitizedName = vehicleName.replace(/[\/\\:*?"<>|]/g, '_');

        // 生成时间戳（格式：YYYYMMDD-HHmmss）
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;

        // 生成文件名：车辆名字-加油记录-时间.csv
        const filename = `${sanitizedName}-加油记录-${timestamp}.csv`;

        // 下载CSV文件
        downloadCSV(csvContent, filename);
        closeModal('exportModal');
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败，请重试');
    }
}

// 导出完整表格CSV
async function exportFullTableCSV() {
    if (!currentVehicleId) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await response.json();

        if (records.length === 0) {
            alert('暂无记录可导出');
            closeModal('exportModal');
            return;
        }

        // 按里程数从小到大排序，用于计算
        const sortedByMileage = [...records].sort((a, b) => a.mileage - b.mileage);

        // 创建里程到记录的映射
        const mileageMap = new Map();
        sortedByMileage.forEach((r, i) => {
            mileageMap.set(r.id, i);
        });

        // 生成CSV内容，包含所有字段
        const headers = ['日期', '里程数(km)', '增加里程数(km)', '加油量(L)', '总价(元)', '单价(元/L)', '油耗(L/100km)', '每公里费用(元/km)'];
        const rows = [headers.join(',')];

        // 按里程数从小到大排序导出
        for (let i = 0; i < sortedByMileage.length; i++) {
            const record = sortedByMileage[i];

            // 检查是否为初始记录
            const isInitialRecord = record.liters === null || record.liters === undefined || record.liters === 0 ||
                record.price === null || record.price === undefined || record.price === 0;

            const liters = isInitialRecord ? 0 : record.liters.toFixed(2);
            const price = isInitialRecord ? 0 : record.price.toFixed(2);
            const pricePerLiter = isInitialRecord ? '' : (record.price / record.liters).toFixed(2);

            let mileageIncrease = '';
            let fuelConsumption = '';
            let costPerKm = '';

            // 计算增加里程数、油耗、每公里费用
            if (i > 0) {
                const prevRecord = sortedByMileage[i - 1];
                const distance = record.mileage - prevRecord.mileage;
                if (distance > 0) {
                    mileageIncrease = distance.toFixed(1);
                    if (record.liters && record.liters > 0) {
                        fuelConsumption = (record.liters / distance * 100).toFixed(2);
                    }
                    if (record.price && record.price > 0) {
                        costPerKm = (record.price / distance).toFixed(2);
                    }
                }
            }

            const row = [
                formatDate(record.refuel_date),
                record.mileage.toFixed(1),
                mileageIncrease || '',
                liters,
                price,
                pricePerLiter || '',
                fuelConsumption || '',
                costPerKm || ''
            ];
            rows.push(row.join(','));
        }

        const csvContent = rows.join('\n');

        // 获取当前车辆名称
        const currentVehicle = vehicles.find(v => v.id === currentVehicleId);
        const vehicleName = currentVehicle ? currentVehicle.name : '未知车辆';

        // 清理车辆名称中的特殊字符
        const sanitizedName = vehicleName.replace(/[\/\\:*?"<>|]/g, '_');

        // 生成时间戳
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;

        // 生成文件名：车辆名字-加油记录完整-时间.csv
        const filename = `${sanitizedName}-加油记录完整-${timestamp}.csv`;

        // 下载CSV文件
        downloadCSV(csvContent, filename);
        closeModal('exportModal');
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败，请重试');
    }
}

// 复制记录到剪切板
async function copyRecordsToClipboard() {
    if (!currentVehicleId) {
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentVehicleId}/records`);
        const records = await response.json();

        if (records.length === 0) {
            alert('暂无记录可复制');
            closeModal('exportModal');
            return;
        }

        // 按里程数从小到大排序
        const sortedRecords = [...records].sort((a, b) => a.mileage - b.mileage);

        // 生成简单CSV内容（复制到剪切板使用简单格式）
        const headers = ['里程数(km)', '加油量(L)', '加油价格(元)'];
        const rows = [headers.join('\t')]; // 使用制表符，方便粘贴到Excel等软件

        for (let i = 0; i < sortedRecords.length; i++) {
            const record = sortedRecords[i];

            const liters = (record.liters !== null && record.liters !== undefined && record.liters > 0)
                ? record.liters.toFixed(2) : '0';
            const price = (record.price !== null && record.price !== undefined && record.price > 0)
                ? record.price.toFixed(2) : '0';

            const row = [
                record.mileage.toFixed(1),
                liters,
                price
            ];
            rows.push(row.join('\t'));
        }

        const content = rows.join('\n');

        // 复制到剪切板
        await navigator.clipboard.writeText(content);
        alert('已复制到剪切板');
        closeModal('exportModal');
    } catch (error) {
        console.error('复制失败:', error);
        alert('复制失败，请重试');
    }
}

// 下载CSV文件（网页内置方式）
function downloadCSV(csvContent, filename) {
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
        const headers = ['日期', '描述', '金额(元)'];
        const rows = [headers.join(',')];

        for (let i = 0; i < expenses.length; i++) {
            const expense = expenses[i];
            const row = [
                formatDate(expense.expense_date),
                expense.title || '消费',
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
    reader.onload = function (e) {
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
    loadMaintenanceData(); // 刷新维保模块
}

// 导入额外消费记录
async function importExpenses(lines) {
    // 跳过表头
    const dataLines = lines.slice(1);
    let successCount = 0;
    let failCount = 0;

    for (const line of dataLines) {
        const values = parseCSVLine(line);
        // 支持2列（日期、金额）或3列（日期、标题、金额）格式
        if (values.length < 2) continue;

        try {
            const dateStr = values[0].trim();
            // 判断是2列还是3列格式
            let amountIndex = values.length === 2 ? 1 : 2;
            const amount = parseFloat(values[amountIndex].replace('¥', ''));

            if (isNaN(amount)) continue;

            let title = '消费';
            if (values.length >= 3) {
                title = values[1].trim() || '消费';
            }

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
            loadMaintenanceData(); // 刷新维保模块
        } else {
            console.error('清空失败：', result.error);
        }
    } catch (error) {
        console.error('清空记录失败:', error);
    }
}

// 图片上传处理
async function handleImageUpload(mode, type, input) {
    const file = input.files[0];
    if (!file) return;

    // 显示上传中状态
    const previewId = `${mode}${type.charAt(0).toUpperCase() + type.slice(1)}ImagePreview`;
    const previewImgId = `${mode}${type.charAt(0).toUpperCase() + type.slice(1)}ImagePreviewImg`;
    const previewDiv = document.getElementById(previewId);
    const previewImg = document.getElementById(previewImgId);

    previewDiv.style.display = 'block';
    previewImg.src = '';
    previewImg.alt = '上传中...';

    // 创建FormData
    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (response.ok) {
            // 保存图片路径
            const pathInputId = `${mode}${type.charAt(0).toUpperCase() + type.slice(1)}ImagePath`;
            document.getElementById(pathInputId).value = result.imageUrl;

            // 显示预览
            previewImg.src = result.imageUrl;
            previewImg.alt = '图片预览';
        } else {
            alert('图片上传失败：' + (result.error || '未知错误'));
            previewDiv.style.display = 'none';
            input.value = '';
        }
    } catch (error) {
        console.error('图片上传失败:', error);
        alert('图片上传失败，请重试');
        previewDiv.style.display = 'none';
        input.value = '';
    }
}

// 删除图片
function removeImage(mode, type) {
    const previewId = `${mode}${type.charAt(0).toUpperCase() + type.slice(1)}ImagePreview`;
    const pathInputId = `${mode}${type.charAt(0).toUpperCase() + type.slice(1)}ImagePath`;
    const fileInputId = `${mode}${type.charAt(0).toUpperCase() + type.slice(1)}Image`;

    document.getElementById(previewId).style.display = 'none';
    document.getElementById(pathInputId).value = '';
    document.getElementById(fileInputId).value = '';
}

// 显示图片模态框
function showImageModal(imageUrl) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.9); display: flex; justify-content: center; align-items: center; cursor: pointer;';
    modal.onclick = () => modal.remove();

    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain;';
    img.onclick = (e) => e.stopPropagation();

    modal.appendChild(img);
    document.body.appendChild(modal);
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

// 密码管理相关功能
let currentPasswordVehicleId = null;

function showSetPasswordModal(vehicleId) {
    currentPasswordVehicleId = vehicleId;
    document.getElementById('setPasswordModal').style.display = 'block';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
}

async function setVehiclePassword() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmPassword) {
        alert('两次输入的密码不一致');
        return;
    }

    try {
        const response = await fetch(`/api/vehicles/${currentPasswordVehicleId}/password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword || null })
        });

        if (response.ok) {
            alert(newPassword ? '密码设置成功' : '密码已取消');
            const savedPasswords = JSON.parse(localStorage.getItem('vehicle_passwords') || '{}');

            if (!newPassword) {
                unlockedVehicles.delete(currentPasswordVehicleId);
                delete savedPasswords[currentPasswordVehicleId];
            } else {
                unlockedVehicles.add(currentPasswordVehicleId);
                savedPasswords[currentPasswordVehicleId] = newPassword;
            }

            localStorage.setItem('vehicle_passwords', JSON.stringify(savedPasswords));
            closeModal('setPasswordModal');
            loadVehicles();
        } else {
            alert('设置失败');
        }
    } catch (error) {
        console.error('设置密码失败:', error);
    }
}

function showUnlockModal(vehicleId) {
    currentPasswordVehicleId = vehicleId;
    document.getElementById('passwordModal').style.display = 'block';
    document.getElementById('vehiclePasswordInput').value = '';
    document.getElementById('vehiclePasswordInput').focus();

    // 设置确定按钮的点击事件
    document.getElementById('passwordConfirmBtn').onclick = verifyPassword;
}

async function verifyPassword() {
    const password = document.getElementById('vehiclePasswordInput').value;
    if (!password) return;

    try {
        const response = await fetch(`/api/vehicles/${currentPasswordVehicleId}/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (response.ok) {
            unlockedVehicles.add(currentPasswordVehicleId);
            // 保存到 localStorage
            const savedPasswords = JSON.parse(localStorage.getItem('vehicle_passwords') || '{}');
            savedPasswords[currentPasswordVehicleId] = password;
            localStorage.setItem('vehicle_passwords', JSON.stringify(savedPasswords));

            closeModal('passwordModal');
            selectVehicle(currentPasswordVehicleId);
        } else {
            alert('密码错误');
            document.getElementById('vehiclePasswordInput').value = '';
        }
    } catch (error) {
        console.error('验证密码失败:', error);
    }
}

// 重新加锁（忘记本地存储的密码）
function lockVehicle(vehicleId) {
    unlockedVehicles.delete(vehicleId);
    const savedPasswords = JSON.parse(localStorage.getItem('vehicle_passwords') || '{}');
    delete savedPasswords[vehicleId];
    localStorage.setItem('vehicle_passwords', JSON.stringify(savedPasswords));

    if (currentVehicleId === vehicleId) {
        currentVehicleId = null;
        document.getElementById('refuelSection').style.display = 'none';
        document.getElementById('expenseSection').style.display = 'none';
        document.getElementById('maintenanceSection').style.display = 'none';
        document.getElementById('statsSection').style.display = 'none';
    }

    renderVehicles();
}

// 监听锁定模态框中的回车键
document.getElementById('vehiclePasswordInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        verifyPassword();
    }
});
