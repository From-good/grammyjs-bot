require('dotenv').config();
const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard } = require('grammy');
const { session } = require('grammy');

// --- Константы и конфигурация ---
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const BOT_API_KEY = process.env.BOT_API_KEY;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);

if (!BOT_API_KEY) {
    throw new Error('BOT_API_KEY не задан в .env файле.');
}
if (isNaN(ADMIN_CHAT_ID)) {
    throw new Error('ADMIN_CHAT_ID не задан или не является числом в .env файле.');
}

const bot = new Bot(BOT_API_KEY);

bot.use(session({
    initial: () => ({
        isFirstMessageSent: false,
        chatHistory: []
    }),
}));

const mainKeyboard = new Keyboard()
    .text('Перейти на сайт2330 🌐')
    .row()
    .text('Наши контакты 📞')
    .resized()
    .persistent();

// --- Вспомогательные функции ---
const sendInitialMessage = async (ctx) => {
    if (!ctx.session.isFirstMessageSent) {
        await ctx.reply('Спасибо за ваше сообщение! Мы скоро свяжемся с вами. 🙏');
        ctx.session.isFirstMessageSent = true;
    }
};

const getUserInfo = (ctx) => {
    const userId = ctx.from?.id;
    const userName = ctx.from?.first_name || 'Пользователь';
    return { userId, userName };
};

const checkFileSize = async (ctx, file) => {
    if (!file || file.file_size > MAX_FILE_SIZE_BYTES) {
        await ctx.replyWithChatAction('typing');
        await ctx.reply(`Извините, файл слишком большой. 😥 Максимальный размер файла — ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ.`);
        return false;
    }
    return true;
};

// --- Middleware для отправки ответов администратора ---
// 🔥 Используем bot.on, чтобы явно обрабатывать сообщения, которые могут быть ответами
bot.on([
    'message:text', 'message:photo', 'message:document', 'message:video', 'message:animation',
    'message:audio', 'message:sticker', 'message:voice', 'message:video_note'
], async (ctx, next) => {
    const { userId } = getUserInfo(ctx);
    const repliedMessage = ctx.message?.reply_to_message;

    // Если сообщение не от администратора или не является ответом, пропускаем
    if (userId !== ADMIN_CHAT_ID || !repliedMessage) {
        return next();
    }

    // Проверяем, что администратор отвечает на сообщение, отправленное ботом
    if (repliedMessage.from.id !== bot.botInfo.id) {
        return next();
    }

    let targetUserId = null;
    const repliedMessageText = repliedMessage.text || repliedMessage.caption;
    const userIdMatch = repliedMessageText?.match(/ID: `(\d+)`/);
    if (userIdMatch) {
        targetUserId = Number(userIdMatch[1]);
    }
    
    if (!targetUserId || isNaN(targetUserId)) {
        await ctx.reply('Не удалось найти ID пользователя в сообщении, на которое вы отвечаете. Убедитесь, что в сообщении есть ID в формате: `ID: 12345`', {
            reply_to_message_id: ctx.message.message_id
        });
        return;
    }

    try {
        const adminMessage = ctx.message;
        const captionText = `*Ответ от FromGood:*\n\n${adminMessage.caption || ''}`;

        // Отправка сообщения клиенту в зависимости от типа
        if (adminMessage.text) {
            await bot.api.sendMessage(targetUserId, `*Ответ от FromGood:*\n\n${adminMessage.text}`, { parse_mode: 'Markdown' });
        } else if (adminMessage.photo) {
            await bot.api.sendPhoto(targetUserId, adminMessage.photo[adminMessage.photo.length - 1].file_id, { caption: captionText, parse_mode: 'Markdown' });
        } else if (adminMessage.document) {
            await bot.api.sendDocument(targetUserId, adminMessage.document.file_id, { caption: captionText, parse_mode: 'Markdown' });
        } else if (adminMessage.video) {
            await bot.api.sendVideo(targetUserId, adminMessage.video.file_id, { caption: captionText, parse_mode: 'Markdown' });
        } else if (adminMessage.animation) {
            await bot.api.sendAnimation(targetUserId, adminMessage.animation.file_id, { caption: captionText, parse_mode: 'Markdown' });
        } else if (adminMessage.audio) {
            await bot.api.sendAudio(targetUserId, adminMessage.audio.file_id, { caption: captionText, parse_mode: 'Markdown' });
        } else if (adminMessage.voice) {
            await bot.api.sendVoice(targetUserId, adminMessage.voice.file_id, { caption: captionText, parse_mode: 'Markdown' });
        } else if (adminMessage.video_note) {
            await bot.api.sendVideoNote(targetUserId, adminMessage.video_note.file_id);
        } else if (adminMessage.sticker) {
            await bot.api.sendSticker(targetUserId, adminMessage.sticker.file_id);
        } else {
            await ctx.reply('Извините, этот тип сообщения не поддерживается для ответа клиенту. ❌', {
                reply_to_message_id: adminMessage.message_id
            });
            return;
        }

        await ctx.reply('Ответ успешно отправлен клиенту. ✅', {
            reply_to_message_id: adminMessage.message_id
        });
    } catch (error) {
        console.error('Ошибка при отправке ответа клиенту:', error);
        await ctx.reply('Не удалось отправить ответ клиенту. ❌ Возможно, он заблокировал бота.', {
            reply_to_message_id: ctx.message.message_id
        });
    }
});

// --- ОСНОВНЫЕ ОБРАБОТЧИКИ ---

bot.command('start', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await ctx.reply('Привет 👋! Напиши нам сообщение или выбери одну из кнопок ниже, чтобы получить нужную информацию.', {
        reply_markup: mainKeyboard
    });
});

bot.hears('Перейти на сайт 🌐', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    await ctx.reply('Отлично! Вот ссылка на наш сайт: https://fromgood.ru');
});

bot.hears('Наши контакты 📞', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    await ctx.reply('Наши контакты: info@fromgood.ru, +7 (495) 973-31-39');
});

bot.callbackQuery(/^reply_to_(\d+)$/, async (ctx) => {
    const targetUserId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    
    await bot.api.sendMessage(targetUserId, '✅ *Ваше сообщение прочитано. Администратор готовит ответ.*', { parse_mode: 'Markdown' });
    await ctx.reply(`Ответьте на это сообщение, чтобы отправить ответ пользователю (ID: \`${targetUserId}\`):`);
});

// Единый обработчик для сообщений клиентов
bot.on(['message:text', 'message:photo', 'message:document', 'message:video', 'message:animation', 'message:audio', 'message:sticker', 'message:voice', 'message:video_note'], async (ctx) => {
    const { userId, userName } = getUserInfo(ctx);
    
    if (userId === ADMIN_CHAT_ID) {
        return;
    }
    
    await sendInitialMessage(ctx);
    
    const messageText = ctx.message.text || `_медиафайл (${Object.keys(ctx.message).filter(k => ['photo', 'document', 'video', 'animation', 'audio', 'sticker', 'voice', 'video_note'].includes(k))})_`;
    const newMessage = {
        from: userName,
        text: messageText,
        timestamp: new Date().toLocaleTimeString('ru-RU')
    };
    ctx.session.chatHistory.push(newMessage);

    if (ctx.session.chatHistory.length > 5) {
        ctx.session.chatHistory.shift(); 
    }

    const formattedHistory = ctx.session.chatHistory
        .map(msg => `*${msg.from}* _(${msg.timestamp})_:\n${msg.text}`)
        .join('\n\n---\n\n');

    const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
    
    let caption = `📜 *История диалога*:\n\n${formattedHistory}\n\n======================\n\n✍️ *Новое сообщение от ${userName}* (ID: \`${userId}\`):`;
    let fileId = null;

    if (ctx.message.text) {
        const messageTextForAdmin = `${caption}\n\n"${ctx.message.text}"`;
        await bot.api.sendMessage(ADMIN_CHAT_ID, messageTextForAdmin, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.photo) {
        fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        if (!await checkFileSize(ctx, ctx.message.photo[ctx.message.photo.length - 1])) return;
        caption += `\n\n_Новое фото_`;
        if (ctx.message.caption) caption += `\n\n${ctx.message.caption}`;
        await bot.api.sendPhoto(ADMIN_CHAT_ID, fileId, { caption, reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.document) {
        fileId = ctx.message.document.file_id;
        if (!await checkFileSize(ctx, ctx.message.document)) return;
        caption += `\n\n_Новый документ_`;
        if (ctx.message.caption) caption += `\n\n${ctx.message.caption}`;
        await bot.api.sendDocument(ADMIN_CHAT_ID, fileId, { caption, reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.video) {
        fileId = ctx.message.video.file_id;
        if (!await checkFileSize(ctx, ctx.message.video)) return;
        caption += `\n\n_Новое видео_`;
        if (ctx.message.caption) caption += `\n\n${ctx.message.caption}`;
        await bot.api.sendVideo(ADMIN_CHAT_ID, fileId, { caption, reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.animation) {
        fileId = ctx.message.animation.file_id;
        if (!await checkFileSize(ctx, ctx.message.animation)) return;
        caption += `\n\n_Новая GIF-анимация_`;
        if (ctx.message.caption) caption += `\n\n${ctx.message.caption}`;
        await bot.api.sendAnimation(ADMIN_CHAT_ID, fileId, { caption, reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.audio) {
        fileId = ctx.message.audio.file_id;
        if (!await checkFileSize(ctx, ctx.message.audio)) return;
        caption += `\n\n_Новый аудиофайл_`;
        if (ctx.message.caption) caption += `\n\n${ctx.message.caption}`;
        await bot.api.sendAudio(ADMIN_CHAT_ID, fileId, { caption, reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.sticker) {
        fileId = ctx.message.sticker.file_id;
        await bot.api.sendSticker(ADMIN_CHAT_ID, fileId);
        caption += `\n\n_Новый стикер_`;
        await bot.api.sendMessage(ADMIN_CHAT_ID, caption, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.voice) {
        fileId = ctx.message.voice.file_id;
        if (!await checkFileSize(ctx, ctx.message.voice)) return;
        caption += `\n\n_Новое голосовое сообщение_`;
        await bot.api.sendVoice(ADMIN_CHAT_ID, fileId, { caption, reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    } else if (ctx.message.video_note) {
        fileId = ctx.message.video_note.file_id;
        await bot.api.sendVideoNote(ADMIN_CHAT_ID, fileId);
        caption += `\n\n_Новая видеозаметка_`;
        await bot.api.sendMessage(ADMIN_CHAT_ID, caption, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
    }
});

// Глобальный обработчик ошибок
bot.catch(async (err) => {
    const ctx = err.ctx;
    console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
    const e = err.error;

    let errorText = '🚨 *Произошла ошибка в работе бота!* 🚨\n\n';
    if (e instanceof GrammyError) {
        errorText += `**Тип ошибки:** Ошибка в запросе\n`;
        errorText += `**Описание:** \`${e.description}\`\n`;
        errorText += `**Код ошибки:** \`${e.error_code}\`\n`;
    } else if (e instanceof HttpError) {
        errorText += `**Тип ошибки:** Ошибка HTTP-запроса\n`;
        errorText += `**Описание:** Не удалось связаться с Telegram. \`${e.message}\`\n`;
    } else {
        errorText += `**Тип ошибки:** Неизвестная ошибка\n`;
        errorText += `**Описание:** \`${e.message}\`\n`;
    }

    errorText += `\n*Информация об обновлении:*\n`;
    errorText += `\`\`\`json\n${JSON.stringify(ctx.update, null, 2)}\n\`\`\``;

    try {
        await bot.api.sendMessage(ADMIN_CHAT_ID, errorText, { parse_mode: 'Markdown' });
    } catch (sendError) {
        console.error('Не удалось отправить сообщение об ошибке администратору:', sendError);
    }
});

async function main() {
    await bot.start();
}

main().catch(console.error);
