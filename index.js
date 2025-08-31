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
    // ИСПРАВЛЕНО: используем username, если он есть, иначе first_name
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
                    const mediaType = Object.keys(ctx.message).find(k => ['photo', 'document', 'video', '
