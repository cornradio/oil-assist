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
    liters REAL NOT NULL,
    price REAL NOT NULL,
    mileage REAL NOT NULL,
    refuel_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )`, (err) => {
    if (err) {
      console.error('创建加油记录表错误:', err.message);
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
      callback(err, this.lastID);
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
function addRefuelRecord(vehicleId, liters, price, mileage, callback) {
  db.run(
    'INSERT INTO refuel_records (vehicle_id, liters, price, mileage) VALUES (?, ?, ?, ?)',
    [vehicleId, liters, price, mileage],
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
             ORDER BY refuel_date ASC`,
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

module.exports = {
  db,
  getAllVehicles,
  addVehicle,
  updateVehicleMileage,
  deleteVehicle,
  addRefuelRecord,
  getRefuelRecords,
  getAllRefuelRecords,
  getVehicleStats
};


