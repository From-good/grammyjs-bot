require('dotenv').config();
const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard } = require('grammy');
const { session } = require('grammy');

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
    initial: () => ({ isFirstMessageSent: false }),
}));

const mainKeyboard = new Keyboard()
    .text('Перейти на сайт 🌐')
    .row()
    .text('Наши контакты 📞')
    .resized()
    .persistent();

// Универсальные функции
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
    if (file.file_size > MAX_FILE_SIZE_BYTES) {
        await ctx.reply(`Извините, файл слишком большой. 😥 Максимальный размер файла — ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ.`);
        return false;
    }
    return true;
};

// --- ОСНОВНЫЕ ОБРАБОТЧИКИ ---

// Обработчик команды /start
bot.command('start', async (ctx) => {
    await ctx.reply('Привет 👋! Напиши нам сообщение или выбери одну из кнопок ниже, чтобы получить нужную информацию.', {
        reply_markup: mainKeyboard
    });
});

// Обработчик нажатия на кнопку "Перейти на сайт"
bot.hears('Перейти на сайт 🌐', async (ctx) => {
    await ctx.reply('Отлично! Вот ссылка на наш сайт: https://fromgood.ru');
});

// Обработчик нажатия на кнопку "Наши контакты"
bot.hears('Наши контакты 📞', async (ctx) => {
    await ctx.reply('Наши контакты: info@fromgood.ru, +7 (495) 973-31-39');
});

// Обработчик нажатия на inline-кнопку "Ответить"
bot.callbackQuery(/^reply_to_(\d+)$/, async (ctx) => {
    const targetUserId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    await ctx.reply(`Ответьте на это сообщение, чтобы отправить ответ пользователю (ID: ${targetUserId}):`);
});

---

### Логика для администратора и клиентов

---

// Логика обработки ответов от администратора
bot.on('message:text').filter(
    (ctx) => ctx.from?.id === ADMIN_CHAT_ID && ctx.message.reply_to_message?.from?.id === bot.botInfo.id,
    async (ctx) => {
        const repliedMessageText = ctx.message.reply_to_message.text;
        const userIdMatch = repliedMessageText.match(/\(ID: (\d+)\)/);
        const targetUserId = userIdMatch && Number(userIdMatch[1]);
        
        if (userIdMatch && !isNaN(targetUserId)) {
            const messageToClient = ctx.message.text;
            try {
                await bot.api.sendMessage(targetUserId, `FromGood:\n\n${messageToClient}`);
                await ctx.reply('Ответ успешно отправлен клиенту. ✅', {
                    reply_to_message_id: ctx.message.message_id
                });
            } catch (error) {
                console.error('Ошибка при отправке ответа клиенту:', error);
                await ctx.reply('Не удалось отправить ответ клиенту. ❌ Возможно, он заблокировал бота.', {
                    reply_to_message_id: ctx.message.message_id
                });
            }
        } else {
            await ctx.reply('Не удалось найти ID пользователя в пересланном сообщении. Убедитесь, что вы отвечаете на сообщение, содержащее ID клиента.', {
                reply_to_message_id: ctx.message.message_id
            });
        }
    }
);

// Логика пересылки сообщений от клиентов администратору
// Этот обработчик теперь работает для всех сообщений, кроме тех, что отправлены администратором
bot.on('message:text').filter(
    (ctx) => ctx.from?.id !== ADMIN_CHAT_ID,
    async (ctx) => {
        const { userId, userName } = getUserInfo(ctx);
        try {
            await sendInitialMessage(ctx);
            const messageToAdmin = `✍️ Новое сообщение от ${userName} (ID: ${userId}):\n\n
