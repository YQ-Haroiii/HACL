//引入fs
const fs = require('fs');

//引入Gemini
const {GoogleGenerativeAI, HarmCategory, HarmBlockThreshold} = require("@google/generative-ai");

async function main(input_message_package, input_bot_config){
    //A: 處理訊息提示詞
    const message_prompt = Process_message_prompt(input_message_package, input_bot_config);
    //A: 處理系統提示詞
    const system_prompt = Process_system_prompt(input_bot_config);
    //B: 處理訓練資料
    const training_data = Process_training_data(input_bot_config);
    //B: 處理歷史紀錄
    const history_data = Process_history_data(input_bot_config);

    //#PROCESS: 同時處理 A類和B類 的結果
    const result_data = Promise.all([message_prompt, system_prompt, training_data, history_data]);

    //#PROCESS: 結合 B類 的結果
    const final_data = result_data[2].concat(result_data[3]);

    //#PROCESS: 將 B類 轉換為Gemini格式
    const gemini_data = Gemini_format(final_data);
    
    //#PROCESS: 產生訊息
    const gemini_reply = Gemini_reply(result_data[0], result_data[1], gemini_data, input_bot_config);

    //#PROCESS: 添加至歷史紀錄
    save_history_data(input_message_package, gemini_reply);

    //#PROCESS: 回傳
    return gemini_reply;
}

//訊息提示詞
async function Process_message_prompt(input_message_package, input_bot_config){
    //取得訊息提示詞
    const Message_prompt_template = await fs.readFileSync('./Prompt/Message_Prompt.txt','utf8');

    //替換各類替換字
    let new_message_prompt = Message_prompt_template;
    new_message_prompt = new_message_prompt.replaceAll('{__USER_NAME}', input_message_package.authorName);
    new_message_prompt = new_message_prompt.replaceAll('{__USER_ID}', input_message_package.authorID);
    new_message_prompt = new_message_prompt.replaceAll('{__USER_MESSAGE}', input_message_package.content);
    if(input_message_package.authorID == input_bot_config.MASTER.__ID){
        new_message_prompt = new_message_prompt.replaceAll('{__USER_CALL}','是你的' + input_bot_config.MASTER.__Call);
        new_message_prompt = new_message_prompt.replaceAll('{__BOT_CALL}','應該稱他為' + input_bot_config.MASTER.__Call);
    }else{
        new_message_prompt = new_message_prompt.replaceAll('{__USER_CALL}','不是' + input_bot_config.MASTER.__Call);
        if(input_bot_config.MASTER.__OtherUser_Call){
            new_message_prompt = new_message_prompt.replaceAll('{__BOT_CALL}','應該稱他為' + input_bot_config.MASTER.__OtherUser_Call);
        }else{
            new_message_prompt = new_message_prompt.replaceAll('{__BOT_CALL}','不應該稱他為' + input_bot_config.MASTER.__Call);
        }
    }
    new_message_prompt = new_message_prompt.replaceAll('{__TIME}', _Time(input_message_package.timestamp));
    new_message_prompt = new_message_prompt.replaceAll('{__LANGUAGE}', input_bot_config.BOT.__Language);

    //回傳
    return new_message_prompt;
}

//系統提示詞
async function Process_system_prompt(input_bot_config){
    //取得系統提示詞
    const System_prompt_template = await fs.readFileSync('./Prompt/System_Prompt.txt','utf8');
    
    //替換各類替換字
    let new_system_prompt = System_prompt_template;
    new_system_prompt = new_system_prompt.replaceAll('{__BOT_NAME}', input_bot_config.BOT.__Name);
    new_system_prompt = new_system_prompt.replaceAll('{__BOT_GENDER}', input_bot_config.BOT.__Gender);
    if(input_bot_config.BOT.__Other_Setting != ''){
        new_system_prompt = new_system_prompt.replaceAll('{__OTHER_SETTING}', ','+input_bot_config.BOT.__Other_Setting);
    }else{
        new_system_prompt = new_system_prompt.replaceAll('{__OTHER_SETTING}', '');
    }
    new_system_prompt = new_system_prompt.replaceAll('{__MASTER_ID}', input_bot_config.MASTER.__ID);
    new_system_prompt = new_system_prompt.replaceAll('{__LANGUAGE}', input_bot_config.BOT.__Language);

    //回傳
    return new_system_prompt;
}

//訓練資料
async function Process_training_data(input_bot_config){
    //建立存放訓練陣列
    let result_data = [];
    
    //取得訓練資料
    const training_data = await JSON.parse(await fs.readFileSync('./Train_Data.json','utf8'));
    //取得訓練用人員
    const training_user = await JSON.parse(await fs.readFileSync('./Train_User.json','utf8'));

    for(let i = 0; i < training_data.length; i++){
        //建立使用人員資料
        let useing_user = {
            name: training_user.name,
            id: training_user.id
        };

        //檢查是不是Master標籤開啟
        if(training_data[i].is_Master){
            useing_user.name = input_bot_config.MASTER.__Name;
            useing_user.id = input_bot_config.MASTER.__ID;
        }

        //建立虛擬的訊息包
        const virtual_message_package = {
            content: training_data[i].input,
            channelID: null,
            authorName: useing_user.name,
            authorID: useing_user.id,
            timestamp: training_data[i].timestamp,
            reference_content: null
        };

        //處理訊息
        const result_package = await Process_message_prompt(virtual_message_package, input_bot_config);

        //替換各類替換字，input
        let new_result_package = result_package;
        new_result_package = new_result_package.replaceAll('{__BOT_NAME}', input_bot_config.BOT.__Name);

        //替換各類替換字，output
        let new_output = training_data[i].output;
        new_output = new_output.replaceAll('{__USER_NAME}', useing_user.name);
        if(training_data[i].is_Master){
            new_output = new_output.replaceAll('{__USER_CALL}', input_bot_config.MASTER.__Call);
        }else{
            if(input_bot_config.MASTER.__OtherUser_Call){
                new_output = new_output.replaceAll('{__USER_CALL}', input_bot_config.MASTER.__OtherUser_Call);
            }else{
                new_output = new_output.replaceAll('{__USER_CALL}', "");
            }
        }

        //添加至訓練陣列
        result_data.push({
            input: new_result_package,
            output: new_output,
        });
    }

    //結尾添加訓練結束
    result_data.push({
        input: "以上為訓練資料，請遵循以上風格，完成下一輪對話，了解以上說明請回應「了解」。",
        output: "了解",
    });

    //回傳
    return result_data;
}

//歷史紀錄
async function Process_history_data(input_bot_config){
    //建立存放歷史陣列
    let history = [];

    //偵測是否有記錄檔
    if(!fs.existsSync('./History.json')){
        return history;
    }

    //如果History.json是空的
    if(fs.readFileSync('./History.json', 'utf8').length == 0){
        return history;
    }

    //取得歷史紀錄
    const history_data = fs.readFile('./History.json','utf8');

    //處理歷史紀錄
    for(let i = 0; i < history_data.length; i++){
        //建立虛擬的訊息包
        const virtual_message_package = {
            content: history_data[i].input,
            channelID: null,
            authorName: history_data[i].authorName,
            authorID: history_data[i].authorID,
            timestamp: history_data[i].timestamp,
            reference_content: null
        };

        //處理訊息
        const result_package = await Process_message_prompt(virtual_message_package, input_bot_config);

        //添加至歷史紀錄
        history.push({
            input: result_package,
            output: history_data[i].output
        });
    }

    //回傳
    return history;
}

function Gemini_format(input_array){
    //建立新陣列，存放處理後的資料
    let new_array = [];

    //開始處理
    for(let i = 0; i < input_array.length; i++){
        new_array.push({
            role: 'User',
            parts: [{text: input_array[i].input}]
        });

        new_array.push({
            role: 'Model',
            parts: [{text: input_array[i].output}]
        });
    }

    //回傳
    return new_array;
}

//Gemini AI
async function Gemini_reply(input_message_prompt, input_system_prompt, input_data, input_bot_config, input_count){
    //判斷參數傳遞
    if(!input_message_prompt || !input_system_prompt || input_data || !input_bot_config){
        console.log('請傳入正確參數');
        process.exit();
    }

    if(!input_count)
        input_count = 1;

    if(input_count >= 5){
        process.exit();
    }

    //設定 : 模型設定
    const genAI = new GoogleGenerativeAI(input_bot_config.API.__Gemini);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.0-pro",
        systemInstruction: input_system_prompt
    });

    const generationConfig = {
        temperature: 2,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
    };

    //設定 : 防護設定
    const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
    ];

    //設定 : 模型調整
    const chat = model.startChat({
        generationConfig,
        safetySettings,
        history: input_data,
    });

    //建立結果
    let result;

    //送出訊息
    try{
        const output = await chat.sendMessage(input_message_prompt);
        const response = output.response;
        result = response.text();
    }catch(error){
        console.log(error);
        result = await new Promise(resolve => setTimeout(async () => resolve(await Gemini_reply(input_message_prompt, input_system_prompt, input_data, input_bot_config, ++input_count)), 1000));
    }

    //修正result的不必要字元
    result = result.replaceAll(/(\n){3,}/gm, "\n");
    result = result.replaceAll(/( ){2,}/gm, " ");
    //移除尾段空白
    result = result.trim();

    //回傳
    return result;
}

//存檔
async function save_history_data(input_message_package, input_gemini_reply){
    //如果History.json不存在
    if(!fs.existsSync('./History.json'))
        fs.writeFileSync('./History.json', '[]');

    //如果History.json是空的
    if(fs.readFileSync('./History.json', 'utf8').length == 0)
        fs.writeFileSync('./History.json', '[]');

    //取得歷史紀錄
    const history_data = await JSON.parse(await fs.readFileSync('./History.json','utf8'));

    //建立歷史紀錄
    let new_history = history_data;

    //建立歷史紀錄包
    new_history.push({
        input: input_message_package.content,
        output: input_gemini_reply,
        authorName: input_message_package.authorName,
        authorID: input_message_package.authorID,
        timestamp: input_message_package.timestamp
    });

    //存檔
    fs.writeFileSync('./History.json', JSON.stringify(new_history));
}

function _Time(input_timestamp){
    //UTC
    const UTC = 8;

    //取得現在時間
    let Unix_Timestamp_ms = input_timestamp;

    //如果沒有輸入時間
    if(!input_timestamp){
        Unix_Timestamp_ms = Date.now();
    }

    const UTC_Unix_Timestamp = Unix_Timestamp_ms + (UTC * ((60 * 60) * 1000));

    const _now = new Date(UTC_Unix_Timestamp)
    const _year = _now.getFullYear();
    const _month = _now.getMonth() + 1;
    const _day = _now.getDate();
    const _hour = _now.getHours();
    const _minute = _now.getMinutes();
    const _second = _now.getSeconds();
    
    const _format_year = String(_year).padStart(4, '0');
    const _format_month = String(_month).padStart(2, '0');
    const _format_day = String(_day).padStart(2, '0');
    const _format_hour = String(_hour).padStart(2, '0');
    const _format_minute = String(_minute).padStart(2, '0');
    const _format_second = String(_second).padStart(2, '0');

    let _format_time =  _format_year + '-' + 
                        _format_month + '-' + 
                        _format_day + ' ' + 
                        _format_hour + ':' + 
                        _format_minute + ':' + 
                        _format_second;

    return _format_time;
}
