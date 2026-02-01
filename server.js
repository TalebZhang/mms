const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3'); // 修改这里
const app = express();

app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

// 连接数据库（使用 better-sqlite3）
const db = new Database('messages.db');

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

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
});

// 确保根路径返回 mms.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/mms.html');
});
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

