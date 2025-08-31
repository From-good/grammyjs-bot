require('dotenv').config();
const { Bot, GrammyError, HttpError, Keyboard } = require('grammy');

const bot = new Bot(process.env.BOT_API_KEY);

// Тестовое значение для ADMIN_CHAT_ID.
// В рабочем проекте замените его на ваш реальный ID.
const ADMIN_CHAT_ID = 7111586271;

// Создаём постоянную клавиатуру с двумя кнопками
const mainKeyboard = new Keyboard()
  .text('Перейти на сайт')
  .row()
  .text('Наши контакты')
  .resized()
  .persistent();

// Команда /start с закреплённой клавиатурой
bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Напиши нам сообщение или выбери одну из кнопок ниже, чтобы получить нужную информацию.', {
    reply_markup: mainKeyboard
  });
});

// Обработчик для текстовых сообщений
bot.on('message:text', async (ctx) => {
  // Проверяем, соответствует ли текст одной из кнопок
  if (ctx.message.text === 'Перейти на сайт') {
    await ctx.reply('Отлично! Вот ссылка на наш сайт: https://fromgood.ru');
  } else if (ctx.message.text === 'Наши контакты') {
    await ctx.reply('Наши контакты: info@fromgood.ru, +7 (495) 973-31-39');
  } else {
    // Если текст не соответствует кнопкам, отправляем его администратору
    try {
      await ctx.reply('Спасибо за ваше сообщение! Мы скоро свяжемся с вами.');

      // Формируем сообщение для администратора
      const userMessage = ctx.message.text;
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || 'Пользователь';
      
      const messageToAdmin = `
        Новое сообщение от ${userName} (${userId}):
        
        Текст сообщения:
        "${userMessage}"
      `.trim();

      await bot.api.sendMessage(ADMIN_CHAT_ID, messageToAdmin);
    } catch (error) {
      console.error('Ошибка при отправке сообщения администратору:', error);
      await ctx.reply('Извините, произошла ошибка. Пожалуйста, попробуйте позже.');
    }
  }
});

// Глобальная обработка ошибок
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

bot.start();
