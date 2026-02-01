const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3'); // 修改这里
const fs = require('fs');          
const path = require('path');

const app = express();

app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

// 连接数据库（使用 better-sqlite3）
const db = new Database('messages.db');

const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}


// 创建表（如果不存在）
db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT DEFAULT '网友',
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        likes INTEGER DEFAULT 0,
        liked BOOLEAN DEFAULT 0
    )
`).run();

// 获取所有留言
app.get('/api/messages', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC');
        const messages = stmt.all();
        
        // 转换 liked 字段（SQLite 存储 0/1）
        const formattedMessages = messages.map(msg => ({
            ...msg,
            liked: msg.liked === 1
        }));
        
        res.json(formattedMessages);
    } catch (err) {
        console.error('获取留言失败:', err);
        res.status(500).json({ error: '获取留言失败' });
    }
});

// 发布留言
app.post('/api/messages', (req, res) => {
    try {
        const { name, content } = req.body;
        const timestamp = Date.now();
        
        const stmt = db.prepare(`
            INSERT INTO messages (name, content, timestamp, likes, liked) 
            VALUES (?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            name || '网友',
            content,
            timestamp,
            0,
            0
        );
        
        const newMessage = {
            id: result.lastInsertRowid,
            name: name || '网友',
            content,
            timestamp,
            likes: 0,
            liked: false
        };
        
        res.json(newMessage);
    } catch (err) {
        console.error('发布留言失败:', err);
        res.status(500).json({ error: '发布留言失败' });
    }
});

// 删除留言
app.delete('/api/messages/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
        const result = stmt.run(id);
        
        if (result.changes === 0) {
            res.status(404).json({ error: '留言不存在' });
        } else {
            res.json({ success: true });
        }
    } catch (err) {
        console.error('删除留言失败:', err);
        res.status(500).json({ error: '删除留言失败' });
    }
});

// 点赞
app.post('/api/messages/:id/like', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        // 先检查是否存在
        const checkStmt = db.prepare('SELECT * FROM messages WHERE id = ?');
        const message = checkStmt.get(id);
        
        if (!message) {
            return res.status(404).json({ error: '留言不存在' });
        }
        
        // 更新点赞数
        const updateStmt = db.prepare(`
            UPDATE messages 
            SET likes = likes + 1, liked = 1 
            WHERE id = ?
        `);
        updateStmt.run(id);
        
        // 获取更新后的数据
        const updated = checkStmt.get(id);
        const formattedMessage = {
            ...updated,
            liked: updated.liked === 1
        };
        
        res.json(formattedMessage);
    } catch (err) {
        console.error('点赞失败:', err);
        res.status(500).json({ error: '点赞失败' });
    }
});



// 确保根路径返回 mms.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/mms.html');
});


// 3. 创建 JSON 导出（可读性好）
function createJSONExport() {
    try {
        const messages = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC').all();
        const exportData = {
            导出时间: new Date().toLocaleString('zh-CN'),
            留言总数: messages.length,
            留言列表: messages.map(msg => ({
                id: msg.id,
                昵称: msg.name,
                内容: msg.content,
                时间: new Date(msg.timestamp).toLocaleString('zh-CN'),
                点赞数: msg.likes,
                已点赞: msg.liked === 1
            }))
        };
        
        const jsonFile = path.join(backupDir, `留言导出_${Date.now()}.json`);
        fs.writeFileSync(jsonFile, JSON.stringify(exportData, null, 2));
        
        console.log(`📄 JSON 导出已创建: ${path.basename(jsonFile)}`);
        return jsonFile;
    } catch (err) {
        console.error('JSON 导出失败:', err);
        return null;
    }
}
// 2. 备份函数
function createBackup() {
    try {
        const timestamp = new Date().toLocaleString('zh-CN').replace(/[/:\\]/g, '-');
        const backupFile = `留言备份_${timestamp}.db`;
        const backupPath = path.join(backupDir, backupFile);
        
        // 复制数据库
        fs.copyFileSync('messages.db', backupPath);
        
        // 同时创建 JSON 文件（方便查看）
        createJSONExport();
        
        console.log(`✅ 备份已创建: ${backupFile}`);
        return backupFile;
    } catch (err) {
        console.error('❌ 备份失败:', err);
        return null;
    }
}



// 4. 清理旧备份（保持目录整洁）
function cleanupOldBackups(maxBackups = 10) {
    try {
        const files = fs.readdirSync(backupDir)
            .map(f => ({
                name: f,
                path: path.join(backupDir, f),
                time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);
        
        if (files.length > maxBackups) {
            for (let i = maxBackups; i < files.length; i++) {
                fs.unlinkSync(files[i].path);
                console.log(`🗑️ 删除旧文件: ${files[i].name}`);
            }
        }
    } catch (err) {
        console.error('清理失败:', err);
    }
}

// ============ API 路由 ============

// 5. 下载数据库文件
app.get('/download/db', (req, res) => {
    if (fs.existsSync('messages.db')) {
        res.download('messages.db', '留言板数据库.db', (err) => {
            if (err) console.error('下载失败:', err);
        });
    } else {
        res.status(404).json({ error: '数据库文件不存在' });
    }
});

// 6. 查看备份列表
app.get('/download/backups', (req, res) => {
    try {
        const files = fs.readdirSync(backupDir)
            .map(f => {
                const filePath = path.join(backupDir, f);
                const stats = fs.statSync(filePath);
                return {
                    文件名: f,
                    大小: `${(stats.size / 1024).toFixed(1)} KB`,
                    修改时间: new Date(stats.mtime).toLocaleString('zh-CN'),
                    下载链接: `/download/backup/${f}`
                };
            })
            .sort((a, b) => new Date(b.修改时间) - new Date(a.修改时间));
        
        res.json({
            备份目录: backupDir,
            文件总数: files.length,
            文件列表: files
        });
    } catch (err) {
        res.status(500).json({ error: '读取备份目录失败' });
    }
});

// 7. 下载备份文件
app.get('/download/backup/:filename', (req, res) => {
    const filePath = path.join(backupDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: '文件不存在' });
    }
});

// 8. 手动创建备份
app.post('/download/create-backup', (req, res) => {
    const backupFile = createBackup();
    if (backupFile) {
        cleanupOldBackups(10);
        res.json({ 
            success: true, 
            message: '备份创建成功',
            备份文件: backupFile,
            下载链接: `/download/backup/${backupFile}`
        });
    } else {
        res.status(500).json({ error: '备份创建失败' });
    }
});

// ============ 自动备份 ============

// 9. 每天自动创建备份（凌晨3点）
function scheduleDailyBackup() {
    const now = new Date();
    const hours = now.getHours();
    
    // 如果是凌晨3点，创建备份
    if (hours === 3) {
        createBackup();
        cleanupOldBackups(10);
    }
}

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
});

setInterval(scheduleDailyBackup, 5 * 60 * 1000);

// 启动时立即备份
    setTimeout(() => {
        console.log('🔄 启动备份系统...');
        createBackup();
        cleanupOldBackups(10);
    }, 10000);

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('服务器运行在 http://localhost:3000');
    console.log('SQLite 数据库文件: messages.db');
});

// 优雅关闭
process.on('SIGINT', () => {
    db.close();
    console.log('已关闭数据库连接');
    process.exit(0);

});


