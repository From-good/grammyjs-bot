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

// ---- MIDDLEWARE ----

// Middleware для обработки ответов администратора
const adminReplyMiddleware = async (ctx, next) => {
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === bot.botInfo.id;
  
  if (ctx.from?.id === ADMIN_CHAT_ID && isReplyToBot) {
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
  } else {
    await next(); // Передаём управление следующему middleware
  }
};

// Middleware для пересылки сообщений от клиентов
const clientMessageMiddleware = async (ctx, next) => {
  const { userId, userName } = getUserInfo(ctx);
  
  if (userId !== ADMIN_CHAT_ID) { // Убедимся, что это не сообщение от админа
    try {
      await sendInitialMessage(ctx);
      const messageToAdmin = `✍️ Новое сообщение от ${userName} (ID: ${userId}):\n\n"${ctx.message.text}"`;
      const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
      
      await bot.api.sendMessage(ADMIN_CHAT_ID, messageToAdmin, {
        reply_markup: inlineKeyboard
      });
    } catch (error) {
      console.error('Ошибка при отправке сообщения администратору:', error);
      await ctx.reply('Извините, произошла ошибка. 😔 Пожалуйста, попробуйте позже.');
    }
  }
  await next();
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

// Применяем middleware к текстовым сообщениям
bot.on('message:text', adminReplyMiddleware, clientMessageMiddleware);

// Обработчики для медиафайлов (остаются без изменений, чтобы избежать дублирования логики)
bot.on('message:photo', async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  if (!await checkFileSize(ctx, photo)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const caption = `✍️ Новое фото от ${userName} (ID: ${userId}):\n\n${ctx.message.caption || ''}`.trim();
  await bot.api.sendPhoto(ADMIN_CHAT_ID, photo.file_id, { caption, reply_markup: inlineKeyboard });
});

bot.on('message:document', async (ctx) => {
  const document = ctx.message.document;
  if (!await checkFileSize(ctx, document)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const caption = `✍️ Новый документ от ${userName} (ID: ${userId}):\n\n${ctx.message.caption || ''}`.trim();
  await bot.api.sendDocument(ADMIN_CHAT_ID, document.file_id, { caption, reply_markup: inlineKeyboard });
});

bot.on('message:video', async (ctx) => {
  const video = ctx.message.video;
  if (!await checkFileSize(ctx, video)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const caption = `✍️ Новое видео от ${userName} (ID: ${userId}):\n\n${ctx.message.caption || ''}`.trim();
  await bot.api.sendVideo(ADMIN_CHAT_ID, video.file_id, { caption, reply_markup: inlineKeyboard });
});

bot.on('message:sticker', async (ctx) => {
  const sticker = ctx.message.sticker;
  if (!await checkFileSize(ctx, sticker)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const messageToAdmin = `✍️ Новый стикер от ${userName} (ID: ${userId})`;
  await bot.api.sendMessage(ADMIN_CHAT_ID, messageToAdmin, { reply_markup: inlineKeyboard });
  await bot.api.sendSticker(ADMIN_CHAT_ID, sticker.file_id);
});

bot.on('message:voice', async (ctx) => {
  const voice = ctx.message.voice;
  if (!await checkFileSize(ctx, voice)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const caption = `✍️ Новое голосовое сообщение от ${userName} (ID: ${userId})`;
  await bot.api.sendVoice(ADMIN_CHAT_ID, voice.file_id, { caption, reply_markup: inlineKeyboard });
});

bot.on('message:video_note', async (ctx) => {
  const videoNote = ctx.message.video_note;
  if (!await checkFileSize(ctx, videoNote)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const caption = `✍️ Новая видеозаметка от ${userName} (ID: ${userId})`;
  await bot.api.sendVideoNote(ADMIN_CHAT_ID, videoNote.file_id, { caption, reply_markup: inlineKeyboard });
});

bot.on('message:animation', async (ctx) => {
  const animation = ctx.message.animation;
  if (!await checkFileSize(ctx, animation)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const caption = `✍️ Новая GIF-анимация от ${userName} (ID: ${userId}):\n\n${ctx.message.caption || ''}`.trim();
  await bot.api.sendAnimation(ADMIN_CHAT_ID, animation.file_id, { caption, reply_markup: inlineKeyboard });
});

bot.on('message:audio', async (ctx) => {
  const audio = ctx.message.audio;
  if (!await checkFileSize(ctx, audio)) return;
  const { userId, userName } = getUserInfo(ctx);
  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  await sendInitialMessage(ctx);
  const caption = `✍️ Новый аудиофайл от ${userName} (ID: ${userId}):\n\n${ctx.message.caption || ''}`.trim();
  await bot.api.sendAudio(ADMIN_CHAT_ID, audio.file_id, { caption, reply_markup: inlineKeyboard });
});


// Глобальный обработчик ошибок
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Ошибка в запросе:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Не удалось связаться с Telegram:", e);
  } else {
    console.error("Неизвестная ошибка:", e);
  }
});

// Запуск бота
async function main() {
  await bot.start();
}

main().catch(console.error);
