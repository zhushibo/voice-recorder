/*
 * @Description: 
 * @Author: doctor
 * @Date: 2019-07-16 12:00:32
 * @LastEditTime: 2019-07-16 14:38:04
 * @LastEditors: doctor
 */
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
class VRecorder{
  constructor(options) {
    this.leftDataList = []
    this.rightDataList = []
    this.mediaPlayer = null
    this.audioContext = null
    //this.timeOut = options.timeOut
  }

  // 是否支持
  isSopport(){
    return navigator.getUserMedia != null
  }

  // 初始化meida
  start(){
    window.navigator.mediaDevices.getUserMedia({
      audio: {
          sampleRate: 44100, // 采样率
          channelCount: 2,   // 声道
          volume: 1.0        // 音量
      }
    }).then(mediaStream => {
        this.mediaPlayer = mediaStream
        this.beginRecord(mediaStream);
    }).catch(err => {
        // 如果用户电脑没有麦克风设备或者用户拒绝了，或者连接出问题了等
        // 这里都会抛异常，并且通过err.name可以知道是哪种类型的错误 
        console.error(err);
    })
  }

  beginRecord (mediaStream) {
    let audioContext = new (window.AudioContext || window.webkitAudioContext);
    let mediaNode = audioContext.createMediaStreamSource(mediaStream);
    // 创建一个jsNode
    let jsNode = this.createJSNode(audioContext);
    // 需要连到扬声器消费掉outputBuffer，process回调才能触发
    // 并且由于不给outputBuffer设置内容，所以扬声器不会播放出声音
    jsNode.connect(audioContext.destination);
    jsNode.onaudioprocess = this.onAudioProcess.bind(this);
    // 把mediaNode连接到jsNode
    mediaNode.connect(jsNode);
    this.audioContext = audioContext
  }

  createJSNode (audioContext) {
    const BUFFER_SIZE = 4096;
    const INPUT_CHANNEL_COUNT = 2;
    const OUTPUT_CHANNEL_COUNT = 2;
    // createJavaScriptNode已被废弃
    let creator = audioContext.createScriptProcessor || audioContext.createJavaScriptNode;
    creator = creator.bind(audioContext);
    return creator(BUFFER_SIZE,INPUT_CHANNEL_COUNT, OUTPUT_CHANNEL_COUNT);
  }

  //播放监听函数
  onAudioProcess (event) {
    console.log('is recording')
    let audioBuffer = event.inputBuffer;
    let leftChannelData = audioBuffer.getChannelData(0),
        rightChannelData = audioBuffer.getChannelData(1);
    // 需要克隆一下
    this.leftDataList.push(leftChannelData.slice(0));
    this.rightDataList.push(rightChannelData.slice(0));
  }

  stopRecord () {
    // 停止录音
    let leftData = mergeArray(this.leftDataList),
        rightData = mergeArray(this.rightDataList);
    let allData = interleaveLeftAndRight(leftData, rightData);
    let wavBuffer = createWavFile(allData);
    console.log(wavBuffer,'wavBuffer')

    //playRecord(wavBuffer);
    this.resetRecord();
    
    // 返回blob文件
    let blob = new Blob([new Int8Array(wavBuffer)], {
      type: 'audio/mp3' // files[0].type
    });
    let blobUrl = URL.createObjectURL(blob);
    return blobUrl
  }

  //停止控件录音
  resetRecord() {
    let self = this
    this.leftDataList = [];
    this.rightDataList = [];
    this.audioContext.close()
    this.mediaPlayer.getAudioTracks().forEach(function(track){
        track.stop()
        self.mediaPlayer.removeTrack(track)
    })
  }
}

function createWavFile (audioData) {
  const WAV_HEAD_SIZE = 44;
  let buffer = new ArrayBuffer(audioData.length * 2 + WAV_HEAD_SIZE),
      // 需要用一个view来操控buffer
      view = new DataView(buffer);
  // 写入wav头部信息
  // RIFF chunk descriptor/identifier
  writeUTFBytes(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 44 + audioData.length * 2, true);
  // RIFF type
  writeUTFBytes(view, 8, 'WAVE');
  // format chunk identifier
  // FMT sub-chunk
  writeUTFBytes(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // stereo (2 channels)
  view.setUint16(22, 2, true);
  // sample rate
  view.setUint32(24, 44100, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, 44100 * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2 * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data sub-chunk
  // data chunk identifier
  writeUTFBytes(view, 36, 'data');
  // data chunk length
  view.setUint32(40, audioData.length * 2, true);

  let length = audioData.length;
  let index = 44;
  let volume = 1;
  for (let i = 0; i < length; i++) {
      view.setInt16(index, audioData[i] * (0x7FFF * volume), true);
      index += 2;
  }
  return buffer;
}

function writeUTFBytes (view, offset, string) {
  var lng = string.length;
  for (var i = 0; i < lng; i++) { 
      view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// 交叉合并左右声道的数据
function interleaveLeftAndRight (left, right) {
  let totalLength = left.length + right.length;
  let data = new Float32Array(totalLength);
  for (let i = 0; i < left.length; i++) {
      let k = i * 2;
      data[k] = left[i];
      data[k + 1] = right[i];
  }
  return data;
}

function mergeArray (list) {
  let length = list.length * list[0].length;
  let data = new Float32Array(length),
      offset = 0;
  for (let i = 0; i < list.length; i++) {
      data.set(list[i], offset);
      offset += list[i].length;
  }
  return data;
}