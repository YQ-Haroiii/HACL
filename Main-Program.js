//INFO: discord js
const {Client} = require("discord.js");

//INFO: Client 權限設定
const client = new Client({});

//INFO: 機器人Config
const bot_config = require('./Config.json');

//INFO: 機器人開機
client.on("ready", async () => {
    Get_master_name();

    console.log("機器人已啟動！" + client.user.tag);
    console.log("邀請連結：" + "https://discord.com/api/oauth2/authorize?client_id=" + client.user.id + "&permissions=0&scope=bot%20applications.commands");
});

//INFO: 監聽訊息
client.on("messageCreate", async (message) => {
    //如果是自己的訊息就跳過
    if(message.author.id == client.user.id)return;

    //取得名稱呼叫的位置
    const Call_name_position = message.content.indexOf(bot_config.BOT.__Name);
    //取得自身mention文字，切備註故意的
    //const bot_mention = "<@" + client.user.id + ">";
    //建立reference指標
    const reference = {content: null, author: null};
    if(message.reference != null && bot_config.CHAT.__Reference){
        reference.author = (message.channel.messages.fetch(message.reference.messageId)).author.id;
        reference.content = (message.channel.messages.fetch(message.reference.messageId)).content;
    }

    //判斷是否為 私人訊息 - 回應 - 名稱呼叫
    if(message.guildId == null || reference.author == client.user.id || (Call_name_position < bot_config.CHAT.__Name_Trigger && Call_name_position > -1)){
        //正在輸入中
        await message.channel.sendTyping();

        //準備訊息包
        const message_package = {
            content: message.content,
            channelID: message.channelId,
            authorName: message.author.globalName,
            authorID: message.author.id,
            timestamp: message.createdTimestamp,
            reference_content: (reference != null) ? reference.content : null
        }

        //引入訊息處理模塊
        const _Process_Message = require("./_Process_Message.js");

        //處理訊息
        const result_package = _Process_Message.main(message_package, bot_config);

        //最終回應
        const result_reply = result_package;

        //回應，痾...好
        if(message.guildId == null)
            message.channel.send(result_reply); //私人訊息狀況下
        else
            message.reply(result_reply);        //伺服器訊息狀況下

        //回傳
        return;
    }
});

function Get_master_name(){
    //取得主人名稱後修正
    try{
        bot_config.MASTER.__Name = client.users.cache.get(bot_config.MASTER.__ID).globalName;
    }catch(e){
        console.log("無法取得主人名稱，請確定該機器人的主人與機器人有共同伺服器。");
    }
}