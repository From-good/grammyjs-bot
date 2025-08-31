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
// --- Конец блока констант ---

const bot = new Bot(BOT_API_KEY);

bot.use(session({
  initial: () => ({
    isFirstMessageSent: false,
    isDialogueStarted: false,
    chatHistory: []
  }),
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
    await ctx.replyWithChatAction('typing');
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
    // 🔥 ИСПРАВЛЕНИЕ: Теперь ищем ID пользователя и в тексте, и в подписи (caption)
    const repliedMessageText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption;
    const userIdMatch = repliedMessageText?.match(/ID: `(\d+)`/);
    const targetUserId = userIdMatch && Number(userIdMatch[1]);
    
    if (userIdMatch && !isNaN(targetUserId)) {
      const messageToClient = ctx.message.text;
      try {
        await bot.api.sendMessage(targetUserId, `*Ответ от FromGood:*\n\n${messageToClient}`, { parse_mode: 'Markdown' });
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
    await next();
  }
};

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
    
    // ✅ Уведомление клиента о прочтении
    await bot.api.sendMessage(targetUserId, '✅ *Ваше сообщение прочитано. Администратор готовит ответ.*', { parse_mode: 'Markdown' });

    // 🔥 ИСПРАВЛЕНИЕ: Добавил пробел между `ID: ` и `userId`, а также обратные кавычки (`), чтобы избежать проблем с парсером Markdown.
    await ctx.reply(`Ответьте на это сообщение, чтобы отправить ответ пользователю (ID: \`${targetUserId}\`):`);
    
    if (ctx.session.isDialogueStarted !== true) {
      await bot.api.sendMessage(targetUserId, '💬 *Администратор начал диалог с вами.*', { parse_mode: 'Markdown' });
      ctx.session.isDialogueStarted = true;
    }
});

// Единый обработчик для сообщений клиентов
bot.on(['message:text', 'message:photo', 'message:document', 'message:video', 'message:animation', 'message:audio', 'message:sticker', 'message:voice', 'message:video_note'], async (ctx) => {
  const { userId, userName } = getUserInfo(ctx);
  
  if (userId === ADMIN_CHAT_ID) {
    return;
  }
  
  await sendInitialMessage(ctx);
  
  // Добавляем текущее сообщение в историю чата
  const messageText = ctx.message.text || `_медиафайл (${Object.keys(ctx.message).filter(k => ['photo', 'document', 'video', 'animation', 'audio', 'sticker', 'voice', 'video_note'].includes(k))})_`;
  const newMessage = {
    from: userName,
    text: messageText,
    timestamp: new Date().toLocaleTimeString('ru-RU')
  };
  ctx.session.chatHistory.push(newMessage);

  // Ограничиваем историю до 5 последних сообщений
  if (ctx.session.chatHistory.length > 5) {
      ctx.session.chatHistory.shift(); 
  }

  // Формируем текст истории для администратора
  const formattedHistory = ctx.session.chatHistory
      .map(msg => `*${msg.from}* _(${msg.timestamp})_:\n${msg.text}`)
      .join('\n\n---\n\n');

  const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply_to_${userId}`);
  
  // 🔥 ИСПРАВЛЕНИЕ: Используем `ID: \`${userId}\`` для более надежного парсинга
  let caption = `📜 *История диалога*:\n\n${formattedHistory}\n\n======================\n\n✍️ *Новое сообщение от ${userName}* (ID: \`${userId}\`):`;
  let fileId = null;

  if (ctx.message.text) {
    caption += `\n\n"${ctx.message.text}"`;
    await bot.api.sendMessage(ADMIN_CHAT_ID, caption, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
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
    if (!await checkFileSize(ctx, ctx.message.sticker)) return;
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
    if (!await checkFileSize(ctx, ctx.message.video_note)) return;
    await bot.api.sendVideoNote(ADMIN_CHAT_ID, fileId);
    caption += `\n\n_Новая видеозаметка_`;
    await bot.api.sendMessage(ADMIN_CHAT_ID, caption, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
  }
});

// Применяем middleware для обработки ответов администратора
bot.on('message:text', adminReplyMiddleware);

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

// Запуск бота
async function main() {
  await bot.start();
}

main().catch(console.error);
