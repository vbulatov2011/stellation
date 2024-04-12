package pvs.utils;


public class Timeout implements Runnable {
  
  TimeoutCallback callback; 
  Object userData;
  long time = 1000;
    
  Thread thread;
  
  public Timeout(long time, TimeoutCallback callback, Object userData) {

    this.callback = callback;
    this.userData = userData;
    this.time = time;
    thread = new Thread(this);
    thread.start();
    
  }

  public void run() {
    
    try {
      Thread.sleep(time);
    } catch (Exception e){
    }
    callback.timeoutCallback(userData);   

  }
  
  public void stop(){
    //try {
      //thread.stop();
    //} catch (Exception e){
    //}
  }
}
