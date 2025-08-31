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
    .text('Перейти на сайт 🌐')
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
    // Исправлено: используем username, если он есть, иначе first_name
    const username = ctx.from?.username || ctx.from?.first_name || 'Пользователь';
    return { userId, username };
};

const checkFileSize = async (ctx, file) => {
    if (!file || file.file_size > MAX_FILE_SIZE_BYTES) {
        await ctx.replyWithChatAction('typing');
        await ctx.reply(`Извините, файл слишком большой. 😥 Максимальный размер файла — ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ.`);
        return false;
    }
    return true;
};

// --- Основные обработчики ---

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

    try {
        await bot.api.sendMessage(targetUserId, '✅ *Администратор увидел ваше сообщение и готовит ответ.*', { parse_mode: 'Markdown' });
    } catch (error) {
        console.warn(`Не удалось уведомить пользователя ${targetUserId}, возможно, он заблокировал бота.`);
    }

    const replyText = `▶️ Введите ответ для пользователя ${targetUserId}`;
    await ctx.reply(replyText, {
        reply_markup: {
            force_reply: true,
            input_field_placeholder: 'Пишите ответ здесь...',
        },
    });
});

// --- Обработка сообщений ---

bot.on('message', async (ctx) => {
    const { userId, username } = getUserInfo(ctx);

    // Логика для ответов от администратора
    if (userId === ADMIN_CHAT_ID && ctx.message.reply_to_message) {
        const repliedMessageText = ctx.message.reply_to_message.text;

        if (repliedMessageText?.startsWith('▶️ Введите ответ для пользователя')) {
            const targetUserId = Number(repliedMessageText.split(' ')[4]);
            if (isNaN(targetUserId)) {
                await ctx.reply('❌ Ошибка: Не удалось определить ID пользователя для ответа.', { reply_to_message_id: ctx.message.message_id });
                return;
            }
            
            try {
                if (ctx.message.text) {
                    await bot.api.sendMessage(targetUserId, `*Ответ от FromGood:*\n\n${ctx.message.text}`, { parse_mode: 'Markdown' });
                } else if (ctx.message.caption) {
                    const mediaType = Object.keys(ctx.message).find(k => ['photo', 'document', 'video', 'animation', 'audio', 'voice'].includes(k));
                    if (mediaType) {
                        const fileId = ctx.message[mediaType]?.[0]?.file_id || ctx.message[mediaType]?.file_id;
                        const captionText = `*Ответ от FromGood:*\n\n${ctx.message.caption}`;
                        const sendMethods = {
                            photo: 'sendPhoto',
                            document: 'sendDocument',
                            video: 'sendVideo',
                            animation: 'sendAnimation',
                            audio: 'sendAudio',
                            voice: 'sendVoice',
                        };
                        await bot.api[sendMethods[mediaType]](targetUserId, fileId, { caption: captionText, parse_mode: 'Markdown' });
                    }
                } else if (ctx.message.sticker) {
                    await bot.api.sendSticker(targetUserId, ctx.message.sticker.file_id);
                } else {
                    await ctx.reply('❌ Извините, этот тип сообщения не поддерживается для ответа клиенту.', { reply_to_message_id: ctx.message.message_id });
                    return;
                }
                await ctx.reply('✅ Ответ успешно отправлен клиенту.', { reply_to_message_id: ctx.message.message_id });
            } catch (error) {
                console.error('Ошибка при отправке ответа клиенту:', error);
                await ctx.reply('❌ Не удалось отправить ответ клиенту. Возможно, он заблокировал бота.', { reply_to_message_id: ctx.message.message_id });
            }
            return;
        }
    }

    // Логика для сообщений от клиента
    if (userId !== ADMIN_CHAT_ID) {
        await sendInitialMessage(ctx);
        const messageText = ctx.message.text || `_медиафайл (${Object.keys(ctx.message).filter(k => ['photo', 'document', 'video', 'animation', 'audio', 'sticker', 'voice', 'video_note'].includes(k)})_`;
        const newMessage = {
            from: username,
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
        
        let caption = `📜 *История диалога*:\n\n${formattedHistory}\n\n======================\n\n✍️ *Новое сообщение от ${username}* (ID: \`${userId}\`):`;
        
        const mediaMessageTypes = ['photo', 'document', 'video', 'animation', 'audio', 'sticker', 'voice', 'video_note'];
        const receivedMediaType = mediaMessageTypes.find(type => ctx.message[type]);

        if (receivedMediaType) {
            let fileInfo = ctx.message[receivedMediaType];
            if (Array.isArray(fileInfo)) {
                fileInfo = fileInfo[fileInfo.length - 1];
            }

            if (fileInfo?.file_size && !await checkFileSize(ctx, fileInfo)) {
                return;
            }

            const sendMethods = {
                photo: 'sendPhoto',
                document: 'sendDocument',
                video: 'sendVideo',
                animation: 'sendAnimation',
                audio: 'sendAudio',
                voice: 'sendVoice',
                sticker: 'sendSticker',
                video_note: 'sendVideoNote'
            };

            caption += `\n\n_Новый ${receivedMediaType}_`;
            if (ctx.message.caption) {
                caption += `\n\n${ctx.message.caption}`;
            }

            const sendOptions = { reply_markup: inlineKeyboard, parse_mode: 'Markdown' };

            // Улучшенная отправка медиафайлов
            if (receivedMediaType === 'sticker' || receivedMediaType === 'video_note') {
                await bot.api[sendMethods[receivedMediaType]](ADMIN_CHAT_ID, fileInfo.file_id);
                await bot.api.sendMessage(ADMIN_CHAT_ID, caption, sendOptions);
            } else {
                await bot.api[sendMethods[receivedMediaType]](ADMIN_CHAT_ID, fileInfo.file_id, { ...sendOptions, caption });
            }
        } else if (ctx.message.text) {
            const messageTextForAdmin = `${caption}\n\n"${ctx.message.text}"`;
            await bot.api.sendMessage(ADMIN_CHAT_ID, messageTextForAdmin, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
        }
    }
});

// Глобальный обработчик ошибок
bot.catch(async (err) => {
    const ctx = err.ctx;
    console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`, err.error);

    const errorDetails = {
        type: 'Неизвестная ошибка',
        description: err.error.message,
        code: null
    };

    if (err.error instanceof GrammyError) {
        errorDetails.type = 'Ошибка в запросе';
        errorDetails.description = err.error.description;
        errorDetails.code = err.error.error_code;
    } else if (err.error instanceof HttpError) {
        errorDetails.type = 'Ошибка HTTP-запроса';
        errorDetails.description = `Не удалось связаться с Telegram. ${err.error.message}`;
    }

    let errorText = '🚨 *Произошла ошибка в работе бота!* 🚨\n\n';
    errorText += `**Тип ошибки:** ${errorDetails.type}\n`;
    errorText += `**Описание:** \`${errorDetails.description}\`\n`;
    if (errorDetails.code) {
        errorText += `**Код ошибки:** \`${errorDetails.code}\`\n`;
    }

    try {
        await bot.api.sendMessage(ADMIN_CHAT_ID, errorText, { parse_mode: 'Markdown' });
    } catch (sendError) {
        console.error('Не удалось отправить сообщение об ошибке администратору:', sendError);
    }
});

async function main() {
    await bot.start();
    console.log('Бот запущен!');
}

main().catch(console.error);
