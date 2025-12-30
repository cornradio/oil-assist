const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'oil_assist.db');

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接错误:', err.message);
  } else {
    console.log('已连接到 SQLite 数据库');
    initDatabase();
  }
});

// 初始化数据库表
function initDatabase() {
  // 车辆表
  db.run(`CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    current_mileage REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('创建车辆表错误:', err.message);
    }
  });

  // 加油记录表
  db.run(`CREATE TABLE IF NOT EXISTS refuel_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    liters REAL,
    price REAL,
    mileage REAL NOT NULL,
    refuel_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    image_path TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )`, (err) => {
    if (err) {
      console.error('创建加油记录表错误:', err.message);
    } else {
      // 添加image_path字段（如果表已存在但字段不存在）
      db.run(`ALTER TABLE refuel_records ADD COLUMN image_path TEXT`, (alterErr) => {
        // 忽略错误（字段可能已存在）
      });
    }
  });

  // 额外消费表
  db.run(`CREATE TABLE IF NOT EXISTS extra_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    image_path TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )`, (err) => {
    if (err) {
      console.error('创建额外消费表错误:', err.message);
    } else {
      // 添加image_path字段（如果表已存在但字段不存在）
      db.run(`ALTER TABLE extra_expenses ADD COLUMN image_path TEXT`, (alterErr) => {
        // 忽略错误（字段可能已存在）
      });
    }
  });

  // 维保设置表
  db.run(`CREATE TABLE IF NOT EXISTS maintenance_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    interval_km REAL NOT NULL,
    description TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    UNIQUE(vehicle_id, interval_km)
  )`, (err) => {
    if (err) {
      console.error('创建维保设置表错误:', err.message);
    }
  });

  // 维保记录表
  db.run(`CREATE TABLE IF NOT EXISTS maintenance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    maintenance_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    mileage REAL NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    image_path TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )`, (err) => {
    if (err) {
      console.error('创建维保记录表错误:', err.message);
    } else {
      // 添加image_path字段（如果表已存在但字段不存在）
      db.run(`ALTER TABLE maintenance_records ADD COLUMN image_path TEXT`, (alterErr) => {
        // 忽略错误（字段可能已存在）
      });
    }
  });
}

// 获取所有车辆
function getAllVehicles(callback) {
  db.all('SELECT * FROM vehicles ORDER BY created_at DESC', [], callback);
}

// 添加车辆
function addVehicle(name, currentMileage, callback) {
  db.run(
    'INSERT INTO vehicles (name, current_mileage) VALUES (?, ?)',
    [name, currentMileage],
    function(err) {
      if (err) {
        callback(err);
      } else {
        const vehicleId = this.lastID;
        // 自动创建一条初始记录（第0条记录）
        db.run(
          'INSERT INTO refuel_records (vehicle_id, liters, price, mileage, refuel_date) VALUES (?, ?, ?, ?, ?)',
          [vehicleId, null, null, currentMileage, new Date().toISOString()],
          function(recordErr) {
            if (recordErr) {
              console.error('创建初始记录错误:', recordErr.message);
            }
            callback(err, vehicleId);
          }
        );
      }
    }
  );
}

// 更新车辆里程
function updateVehicleMileage(vehicleId, mileage, callback) {
  db.run(
    'UPDATE vehicles SET current_mileage = ? WHERE id = ?',
    [mileage, vehicleId],
    callback
  );
}

// 删除车辆
function deleteVehicle(vehicleId, callback) {
  db.run('DELETE FROM vehicles WHERE id = ?', [vehicleId], (err) => {
    if (err) {
      callback(err);
    } else {
      // 同时删除该车辆的所有加油记录
      db.run('DELETE FROM refuel_records WHERE vehicle_id = ?', [vehicleId], callback);
    }
  });
}

// 添加加油记录
function addRefuelRecord(vehicleId, liters, price, mileage, refuelDate, imagePath, callback) {
  const date = refuelDate || new Date().toISOString();
  // 如果liters或price为空或0，设置为null（初始记录）
  const litersValue = (liters === null || liters === undefined || liters === '' || liters === 0) ? null : liters;
  const priceValue = (price === null || price === undefined || price === '' || price === 0) ? null : price;
  db.run(
    'INSERT INTO refuel_records (vehicle_id, liters, price, mileage, refuel_date, image_path) VALUES (?, ?, ?, ?, ?, ?)',
    [vehicleId, litersValue, priceValue, mileage, date, imagePath || null],
    function(err) {
      if (err) {
        callback(err);
      } else {
        // 更新车辆当前里程
        updateVehicleMileage(vehicleId, mileage, (updateErr) => {
          callback(updateErr, this.lastID);
        });
      }
    }
  );
}

// 更新加油记录
function updateRefuelRecord(recordId, liters, price, mileage, refuelDate, imagePath, callback) {
  db.run(
    'UPDATE refuel_records SET liters = ?, price = ?, mileage = ?, refuel_date = ?, image_path = ? WHERE id = ?',
    [liters, price, mileage, refuelDate, imagePath || null, recordId],
    function(err) {
      if (err) {
        callback(err);
      } else {
        // 获取车辆ID以更新里程
        db.get('SELECT vehicle_id FROM refuel_records WHERE id = ?', [recordId], (err, row) => {
          if (err) {
            callback(err);
          } else if (row) {
            // 更新车辆当前里程为最大里程
            db.get(
              'SELECT MAX(mileage) as max_mileage FROM refuel_records WHERE vehicle_id = ?',
              [row.vehicle_id],
              (err, result) => {
                if (!err && result) {
                  updateVehicleMileage(row.vehicle_id, result.max_mileage || mileage, callback);
                } else {
                  callback(null);
                }
              }
            );
          } else {
            callback(null);
          }
        });
      }
    }
  );
}

// 删除加油记录
function deleteRefuelRecord(recordId, callback) {
  // 先获取记录信息
  db.get('SELECT vehicle_id, mileage FROM refuel_records WHERE id = ?', [recordId], (err, record) => {
    if (err) {
      callback(err);
    } else {
      // 删除记录
      db.run('DELETE FROM refuel_records WHERE id = ?', [recordId], (err) => {
        if (err) {
          callback(err);
        } else if (record) {
          // 更新车辆当前里程为剩余记录的最大里程
          db.get(
            'SELECT MAX(mileage) as max_mileage FROM refuel_records WHERE vehicle_id = ?',
            [record.vehicle_id],
            (err, result) => {
              if (!err && result) {
                updateVehicleMileage(record.vehicle_id, result.max_mileage || 0, callback);
              } else {
                callback(null);
              }
            }
          );
        } else {
          callback(null);
        }
      });
    }
  });
}

// 获取车辆的加油记录
function getRefuelRecords(vehicleId, callback) {
  db.all(
    'SELECT * FROM refuel_records WHERE vehicle_id = ? ORDER BY refuel_date DESC',
    [vehicleId],
    callback
  );
}

// 获取所有车辆的加油记录（用于统计）
function getAllRefuelRecords(callback) {
  db.all(
    `SELECT r.*, v.name as vehicle_name 
     FROM refuel_records r 
     JOIN vehicles v ON r.vehicle_id = v.id 
     ORDER BY r.refuel_date DESC`,
    [],
    callback
  );
}

// 获取车辆统计信息
function getVehicleStats(vehicleId, callback) {
  db.all(
    `SELECT 
      COUNT(*) as total_refuels,
      SUM(liters) as total_liters,
      SUM(price) as total_cost,
      AVG(price / liters) as avg_price_per_liter,
      MIN(mileage) as min_mileage,
      MAX(mileage) as max_mileage,
      MAX(mileage) - MIN(mileage) as total_distance
     FROM refuel_records 
     WHERE vehicle_id = ?`,
    [vehicleId],
    (err, rows) => {
      if (err) {
        callback(err);
      } else {
        const stats = rows[0];
        // 计算平均油耗（需要至少2条记录）
        if (stats.total_refuels >= 2) {
          db.all(
            `SELECT mileage, liters 
             FROM refuel_records 
             WHERE vehicle_id = ? 
             ORDER BY mileage ASC`,
            [vehicleId],
            (err2, records) => {
              if (err2) {
                callback(err2);
              } else {
                let totalDistance = 0;
                let totalLiters = 0;
                for (let i = 1; i < records.length; i++) {
                  const distance = records[i].mileage - records[i-1].mileage;
                  totalDistance += distance;
                  totalLiters += records[i].liters;
                }
                stats.avg_fuel_consumption = totalLiters > 0 ? (totalLiters / totalDistance * 100).toFixed(2) : 0;
                callback(null, stats);
              }
            }
          );
        } else {
          stats.avg_fuel_consumption = 0;
          callback(null, stats);
        }
      }
    }
  );
}

// 获取车辆的额外消费记录
function getExtraExpenses(vehicleId, callback) {
  db.all(
    'SELECT * FROM extra_expenses WHERE vehicle_id = ? ORDER BY expense_date DESC',
    [vehicleId],
    callback
  );
}

// 添加额外消费记录
function addExtraExpense(vehicleId, title, amount, expenseDate, imagePath, callback) {
  const date = expenseDate || new Date().toISOString();
  db.run(
    'INSERT INTO extra_expenses (vehicle_id, title, amount, expense_date, image_path) VALUES (?, ?, ?, ?, ?)',
    [vehicleId, title, amount, date, imagePath || null],
    function(err) {
      callback(err, this.lastID);
    }
  );
}

// 更新额外消费记录
function updateExtraExpense(expenseId, title, amount, expenseDate, imagePath, callback) {
  db.run(
    'UPDATE extra_expenses SET title = ?, amount = ?, expense_date = ?, image_path = ? WHERE id = ?',
    [title, amount, expenseDate, imagePath || null, expenseId],
    callback
  );
}

// 删除额外消费记录
function deleteExtraExpense(expenseId, callback) {
  db.run('DELETE FROM extra_expenses WHERE id = ?', [expenseId], callback);
}

// 获取车辆额外消费统计
function getExtraExpenseStats(vehicleId, callback) {
  db.all(
    `SELECT 
      COUNT(*) as total_expenses,
      SUM(amount) as total_amount
     FROM extra_expenses 
     WHERE vehicle_id = ?`,
    [vehicleId],
    (err, rows) => {
      if (err) {
        callback(err);
      } else {
        callback(null, rows[0] || { total_expenses: 0, total_amount: 0 });
      }
    }
  );
}

// 清空车辆的加油记录
function clearRefuelRecords(vehicleId, callback) {
  // 先获取车辆初始里程
  db.get('SELECT current_mileage FROM vehicles WHERE id = ?', [vehicleId], (err, vehicle) => {
    if (err) {
      callback(err);
      return;
    }
    
    const initialMileage = vehicle ? vehicle.current_mileage : 0;
    
    // 删除所有记录
    db.run('DELETE FROM refuel_records WHERE vehicle_id = ?', [vehicleId], (err2) => {
      if (err2) {
        callback(err2);
      } else {
        // 重新创建初始记录
        db.run(
          'INSERT INTO refuel_records (vehicle_id, liters, price, mileage, refuel_date) VALUES (?, ?, ?, ?, ?)',
          [vehicleId, null, null, initialMileage, new Date().toISOString()],
          function(err3) {
            if (err3) {
              console.error('创建初始记录错误:', err3.message);
            }
            // 重置车辆里程
            updateVehicleMileage(vehicleId, initialMileage, callback);
          }
        );
      }
    });
  });
}

// 清空车辆的额外消费记录
function clearExtraExpenses(vehicleId, callback) {
  db.run('DELETE FROM extra_expenses WHERE vehicle_id = ?', [vehicleId], callback);
}

// 获取车辆的维保设置
function getMaintenanceSettings(vehicleId, callback) {
  db.all(
    'SELECT * FROM maintenance_settings WHERE vehicle_id = ? ORDER BY interval_km ASC',
    [vehicleId],
    callback
  );
}

// 添加维保设置
function addMaintenanceSetting(vehicleId, intervalKm, description, callback) {
  db.run(
    'INSERT OR REPLACE INTO maintenance_settings (vehicle_id, interval_km, description) VALUES (?, ?, ?)',
    [vehicleId, intervalKm, description || null],
    function(err) {
      callback(err, this.lastID);
    }
  );
}

// 删除维保设置
function deleteMaintenanceSetting(settingId, callback) {
  db.run('DELETE FROM maintenance_settings WHERE id = ?', [settingId], callback);
}

// 获取车辆的维保记录
function getMaintenanceRecords(vehicleId, callback) {
  db.all(
    'SELECT * FROM maintenance_records WHERE vehicle_id = ? ORDER BY maintenance_date DESC',
    [vehicleId],
    callback
  );
}

// 获取最后一次维保记录（按里程数）
function getLastMaintenanceRecord(vehicleId, intervalKm, callback) {
  db.get(
    `SELECT * FROM maintenance_records 
     WHERE vehicle_id = ? AND mileage <= (SELECT MAX(mileage) FROM maintenance_records WHERE vehicle_id = ?)
     ORDER BY mileage DESC LIMIT 1`,
    [vehicleId, vehicleId],
    callback
  );
}

// 添加维保记录
function addMaintenanceRecord(vehicleId, mileage, description, amount, maintenanceDate, imagePath, callback) {
  const date = maintenanceDate || new Date().toISOString();
  db.run(
    'INSERT INTO maintenance_records (vehicle_id, mileage, description, amount, maintenance_date, image_path) VALUES (?, ?, ?, ?, ?, ?)',
    [vehicleId, mileage, description || null, amount, date, imagePath || null],
    function(err) {
      callback(err, this.lastID);
    }
  );
}

// 更新维保记录
function updateMaintenanceRecord(recordId, mileage, description, amount, maintenanceDate, imagePath, callback) {
  db.run(
    'UPDATE maintenance_records SET mileage = ?, description = ?, amount = ?, maintenance_date = ?, image_path = ? WHERE id = ?',
    [mileage, description, amount, maintenanceDate, imagePath || null, recordId],
    callback
  );
}

// 删除维保记录
function deleteMaintenanceRecord(recordId, callback) {
  db.run('DELETE FROM maintenance_records WHERE id = ?', [recordId], callback);
}

module.exports = {
  db,
  getAllVehicles,
  addVehicle,
  updateVehicleMileage,
  deleteVehicle,
  addRefuelRecord,
  updateRefuelRecord,
  deleteRefuelRecord,
  getRefuelRecords,
  getAllRefuelRecords,
  getVehicleStats,
  getExtraExpenses,
  addExtraExpense,
  updateExtraExpense,
  deleteExtraExpense,
  getExtraExpenseStats,
  clearRefuelRecords,
  clearExtraExpenses,
  getMaintenanceSettings,
  addMaintenanceSetting,
  deleteMaintenanceSetting,
  getMaintenanceRecords,
  getLastMaintenanceRecord,
  addMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord
};


