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

// Храним ID пользователей, чтобы сопоставлять их с сообщениями
// В реальном проекте лучше использовать базу данных
const userMessages = new Map();

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
  const adminId = String(ADMIN_CHAT_ID);
  const senderId = String(ctx.from.id);
  const botInfo = await bot.api.getMe();
  const botId = botInfo.id;

  // Игнорируем сообщения от самого бота
  if (ctx.from.id === botId) {
    return;
  }

  // Проверяем, отвечает ли администратор на сообщение, и что это его ID
  if (senderId === adminId && ctx.message.reply_to_message) {
    const repliedMessage = ctx.message.reply_to_message;
    
    // Проверяем, что это ответ на пересланное сообщение, а не на обычный текст
    if (repliedMessage.forward_from) {
      const targetUserId = repliedMessage.forward_from.id;
      const messageToClient = ctx.message.text;

      try {
        await bot.api.sendMessage(targetUserId, `FromGood:\n\n${messageToClient}`);
        await ctx.reply('Ответ успешно отправлен клиенту.');
      } catch (error) {
        if (error instanceof GrammyError && error.description.includes('bot was blocked by the user')) {
          await ctx.reply('Не удалось отправить ответ клиенту. Бот был заблокирован пользователем.');
        } else {
          console.error('Ошибка при отправке ответа клиенту:', error);
          await ctx.reply('Не удалось отправить ответ клиенту. Произошла неизвестная ошибка.');
        }
      }
      return; // Завершаем обработку
    } else {
      await ctx.reply('Вы отвечаете не на пересланное сообщение пользователя. Отвечайте только на сообщения, которые переслал бот.');
      return;
    }
  }

  // Если сообщение от клиента, пересылаем его администратору
  try {
    await ctx.reply('Спасибо за ваше сообщение! Мы скоро свяжемся с вами.');
    // Пересылаем сообщение администратору, чтобы сохранить информацию об отправителе
    await bot.api.forwardMessage(ADMIN_CHAT_ID, ctx.from.id, ctx.message.message_id);
    const userName = ctx.from.first_name || 'Пользователь';
    
    const messageToAdmin = `
Новое сообщение от ${userName} (ID: ${ctx.from.id}):

Текст сообщения:
"${ctx.message.text}"

Для ответа просто нажмите "Ответить" на пересланное сообщение.
    `.trim();

    await bot.api.sendMessage(ADMIN_CHAT_ID, messageToAdmin);

  } catch (error) {
    console.error('Ошибка при отправке сообщения администратору:', error);
    await ctx.reply('Извините, произошла ошибка. Пожалуйста, попробуйте позже.');
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
