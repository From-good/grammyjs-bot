require('dotenv').config();
const { Bot, GrammyError, HttpError, Keyboard } = require('grammy');

const bot = new Bot(process.env.BOT_API_KEY);

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const mainKeyboard = new Keyboard()
  .text('Перейти на сайт')
  .row()
  .text('Наши контакты')
  .resized()
  .persistent();

bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Напиши нам сообщение или выбери одну из кнопок ниже, чтобы получить нужную информацию.', {
    reply_markup: mainKeyboard
  });
});

bot.hears('Перейти на сайт', async (ctx) => {
  await ctx.reply('Отлично! Вот ссылка на наш сайт: https://fromgood.ru');
});

bot.hears('Наши контакты', async (ctx) => {
  await ctx.reply('Наши контакты: info@fromgood.ru, +7 (495) 973-31-39');
});

bot.on('message:text', async (ctx) => {
  const botInfo = await bot.api.getMe();
  const botId = botInfo.id;
  
  if (ctx.from.id === botId) {
    return;
  }

  // Проверяем, является ли отправитель администратором, и отвечает ли он на сообщение бота
  if (String(ctx.from.id) === String(ADMIN_CHAT_ID) && ctx.message.reply_to_message) {
    const repliedMessage = ctx.message.reply_to_message;
    const repliedText = repliedMessage.text;

    // Извлекаем ID клиента из пересланного сообщения
    const userIdMatch = repliedText.match(/\(ID: (\d+)\)/);
    if (userIdMatch && userIdMatch[1]) {
      const targetUserId = parseInt(userIdMatch[1]);
      const messageToClient = ctx.message.text;

      try {
        await bot.api.sendMessage(targetUserId, `FromGood:\n\n${messageToClient}`);
        await ctx.reply('Ответ успешно отправлен клиенту.');
      } catch (error) {
        console.error('Ошибка при отправке ответа клиенту:', error);
        await ctx.reply('Не удалось отправить ответ клиенту. Возможно, он заблокировал бота.');
      }
    } else {
      await ctx.reply('Не удалось найти ID пользователя в пересланном сообщении.');
    }
  } else {
    // Если сообщение от клиента, пересылаем его администратору
    try {
      await ctx.reply('Спасибо за ваше сообщение! Мы скоро свяжемся с вами.');

      const userMessage = ctx.message.text;
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || 'Пользователь';
      
      const messageToAdmin = `
        Новое сообщение от ${userName} (ID: ${userId}):
        
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

async function main() {
  await bot.start();
}

main().catch(console.error);
