# Run with python3 scripts/verify-codex-provider-switch.py.
# Uses an installed Codex app-server, temporary homes, synthetic keys and local endpoints.
import json,os,pathlib,subprocess,threading,queue,time,tempfile,shutil
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
repo=pathlib.Path(__file__).resolve().parent.parent
root=pathlib.Path(tempfile.mkdtemp(prefix='azt-product-switch-'))
binary=os.environ.get('CODEX_TEST_BINARY') or shutil.which('codex')
if not binary:raise RuntimeError('Set CODEX_TEST_BINARY to an installed Codex binary.')
codex_home=root/'codex-home';codex_home.mkdir(exist_ok=True)
requests=[]
transport_attempts=[]
phase_records=[]
active_phase={}
class Handler(BaseHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 def log_message(self,*args):pass
 def events(self,body):
  requests.append({'path':self.path,'model':body.get('model'),'reasoningEffort':(body.get('reasoning') or {}).get('effort'),'inputCount':len(body.get('input',[])),'hasEarlierMarker':'marker-first' in json.dumps(body),'usedNativeToken':self.headers.get('Authorization')=='Bearer '+jwt,'usedThirdKey':self.headers.get('Authorization')=='Bearer fixture-key-b','authMatchesTarget':self.headers.get('Authorization') == expected_auth,'officialAccountHeaderPresent':bool(self.headers.get('ChatGPT-Account-Id')),'phase':active_phase.get('name'),'transport':'ws' if self.headers.get('Upgrade','').lower()=='websocket' else 'http','encoding':self.headers.get('Content-Encoding')})
  item={'id':'msg_fixture','type':'message','role':'assistant','status':'completed','content':[{'type':'output_text','text':'Fixture answer','annotations':[]}]}
  response={'id':'resp_fixture','object':'response','created_at':1,'status':'completed','model':body.get('model','gpt-5.4'),'output':[item],'usage':{'input_tokens':10,'output_tokens':2,'total_tokens':12}}
  return [{'type':'response.created','response':{**response,'status':'in_progress','output':[]}}, {'type':'response.output_item.added','output_index':0,'item':{**item,'status':'in_progress','content':[]}}, {'type':'response.output_text.delta','item_id':'msg_fixture','output_index':0,'content_index':0,'delta':'Fixture answer'}, {'type':'response.output_item.done','output_index':0,'item':item}, {'type':'response.completed','response':response}]
 def do_GET(self):
  if self.headers.get('Upgrade','').lower()=='websocket':
   transport_attempts.append({'path':self.path,'phase':active_phase.get('name'),'transport':'ws'})
   if '/third-' in self.path:
    body=b'{"error":{"message":"WebSocket unsupported"}}'
    self.send_response(426);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
   import hashlib,base64,struct
   accept=base64.b64encode(hashlib.sha1((self.headers['Sec-WebSocket-Key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
   self.send_response(101);self.send_header('Upgrade','websocket');self.send_header('Connection','Upgrade');self.send_header('Sec-WebSocket-Accept',accept);self.end_headers()
   self.connection.settimeout(15)
   try:
    while True:
     head=self.rfile.read(2)
     if len(head)<2:return
     opcode=head[0]&15;size=head[1]&127;masked=head[1]&128
     if size==126:size=struct.unpack('!H',self.rfile.read(2))[0]
     elif size==127:size=struct.unpack('!Q',self.rfile.read(8))[0]
     mask=self.rfile.read(4) if masked else None
     payload=self.rfile.read(size)
     if mask:payload=bytes(v^mask[i%4] for i,v in enumerate(payload))
     if opcode==8:return
     if opcode!=1:continue
     for event in self.events(json.loads(payload)):
      data=json.dumps(event).encode();n=len(data)
      frame=b'\x81'+(bytes([n]) if n<126 else b'\x7e'+struct.pack('!H',n))+data
      self.wfile.write(frame)
     self.wfile.flush()
   except (TimeoutError,ConnectionError,OSError):return
   finally:self.close_connection=True
  else:
   body=json.dumps({'data':[],'models':[catalog_entry('gpt-5.4'),catalog_entry('gpt-5.4-mini')]}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_CONNECT(self):
  self.send_response(502);self.send_header('Content-Length','0');self.end_headers()
 def do_POST(self):
  raw=self.rfile.read(int(self.headers.get('content-length','0')))
  if self.headers.get('Content-Encoding')=='zstd':raw=subprocess.run(['zstd','-d','--stdout','--quiet'],input=raw,capture_output=True,check=True).stdout
  body=json.loads(raw) if raw else {}
  payload=''.join('data: '+json.dumps(e)+'\n\n' for e in self.events(body)).encode()
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'

class Client:
 def __init__(self):
  self.q=queue.Queue();self.seq=0;self.pending=[]
  self.log=(root/'stderr.log').open('a')
  self.p=subprocess.Popen([binary,'app-server','--listen','stdio://'],cwd=root,env={**{k:v for k,v in os.environ.items() if not k.startswith(('CODEX_','OPENAI_'))},'CODEX_HOME':str(codex_home),'HTTP_PROXY':base,'HTTPS_PROXY':base,'ALL_PROXY':base,'NO_PROXY':'127.0.0.1,localhost','http_proxy':base,'https_proxy':base,'all_proxy':base,'no_proxy':'127.0.0.1,localhost'},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,text=True,bufsize=1)
  threading.Thread(target=self.reader,daemon=True).start()
  self.rpc('initialize',{'clientInfo':{'name':'azt-switch-eval','version':'0.0.0'},'capabilities':{'experimentalApi':True}})
  self.p.stdin.write(json.dumps({'method':'initialized'})+'\n');self.p.stdin.flush()
 def reader(self):
  for line in self.p.stdout:
   try:self.q.put(json.loads(line))
   except:pass
 def rpc(self,method,params):
  self.seq+=1;rid=self.seq;self.p.stdin.write(json.dumps({'id':rid,'method':method,'params':params})+'\n');self.p.stdin.flush();deadline=time.time()+20
  while time.time()<deadline:
   m=self.q.get(timeout=max(.1,deadline-time.time()))
   if m.get('id')==rid:
    if 'error' in m:raise RuntimeError(json.dumps(m['error']))
    return m['result']
   self.pending.append(m)
  raise TimeoutError(method)
 def turn(self,tid,text):
  self.pending=[]
  result=self.rpc('turn/start',{'threadId':tid,'input':[{'type':'text','text':text}]})
  deadline=time.time()+45
  while time.time()<deadline:
   m=self.pending.pop(0) if self.pending else self.q.get(timeout=max(.1,deadline-time.time()))
   if m.get('method')=='turn/completed':
    turn=m['params']['turn']
    if turn['status']!='completed':raise RuntimeError('turn failed: '+str(turn.get('error')))
    return turn
   if m.get('method')=='error' and not m.get('params',{}).get('willRetry'):raise RuntimeError('turn error: '+str(m.get('params',{}).get('error',{}).get('message')))
  raise TimeoutError('turn/completed')
 def close(self):
  self.p.terminate()
  try:self.p.wait(timeout=5)
  except subprocess.TimeoutExpired:self.p.kill();self.p.wait()
  self.log.close()
import base64,datetime,sqlite3,hashlib

def catalog_entry(slug):
 return {'slug':slug,'display_name':slug,'description':'Isolated verification model','supported_reasoning_levels':[{'effort':'high','description':'Fixture effort'}], 'shell_type':'unified_exec','visibility':'list','supported_in_api':True,'priority':0,'additional_speed_tiers':[],'service_tiers':[],'availability_nux':None,'upgrade':None,'include_skills_usage_instructions':False,'include_plugin_usage_instructions':False,'include_apps_usage_instructions':False,'supports_reasoning_summary_parameter':False,'default_reasoning_summary':'none','support_verbosity':False,'default_verbosity':None,'apply_patch_tool_type':None,'web_search_tool_type':'text','truncation_policy':{'mode':'bytes','limit':10000},'supports_image_detail_original':False,'context_window':128000,'max_context_window':128000,'effective_context_window_percent':95,'experimental_supported_tools':[],'input_modalities':['text'],'supports_search_tool':False,'supports_experimental_context':False,'use_responses_lite':False,'node_repl_auto_review_required':False,'node_repl_disabled':True,'base_instructions':'This is an isolated transport verification. Reply briefly; do not execute tools.'}

claims={'sub':'fixture-user','email':'fixture@example.test','exp':int(time.time())+86400,'https://api.openai.com/auth':{'chatgpt_account_id':'fixture-account','chatgpt_user_id':'fixture-user','chatgpt_plan_type':'plus'}}
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
jwt=enc({'alg':'none'})+'.'+enc(claims)+'.fixture-signature'
native_auth={'auth_mode':'chatgpt','OPENAI_API_KEY':None,'tokens':{'id_token':jwt,'access_token':jwt,'refresh_token':'fixture-refresh','account_id':'fixture-account'},'last_refresh':datetime.datetime.now(datetime.timezone.utc).isoformat()}


records=[];c=None;tid=None
worker=root/'switch.ts'
worker.write_text('import { ExternalProviderService } from '+json.dumps(str(repo/'src/core/services/external-provider-service.ts'))+''';
const service=new ExternalProviderService();
const input=JSON.parse(process.argv[2]);
if(input.action==='native') {
 const current=await service.list();
 if(!current.activeProviderId) throw new Error('No active third party');
 await service.deactivate(current.activeProviderId);
} else {
 const provider=await service.create({name:input.action,baseUrl:input.baseUrl,apiToken:input.key,modelSource:'manual',manualModelIds:[input.model]});
 await service.activate(provider.id,[input.model],input.model);
}
console.log('switch complete');
''')
(codex_home/'auth.json').write_text(json.dumps(native_auth))
auth_hash=hashlib.sha256((codex_home/'auth.json').read_bytes()).hexdigest()
models=codex_home/'native-models.json'
models.write_text(json.dumps({'models':[catalog_entry('gpt-5.4')]}))
(codex_home/'models_cache.json').write_bytes(models.read_bytes())
(codex_home/'config.toml').write_text('model_provider = "openai"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\nopenai_base_url = '+json.dumps(base+'/native/v1')+'\nmodel_catalog_json = '+json.dumps(str(models))+'\ncli_auth_credentials_store = "file"\nchatgpt_base_url = '+json.dumps(base+'/chatgpt')+'\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n[features]\napps = false\n')
try:
 for name in ['native-start','third-b','third-c','native-restored']:
  active_phase={'name':name};expected_auth='Bearer '+(jwt if name.startswith('native') else 'fixture-key-'+name[-1])
  if c:c.close();c=None
  if tid:
   db=sqlite3.connect(codex_home/'state_5.sqlite');rollout=pathlib.Path(db.execute('SELECT rollout_path FROM threads WHERE id=?',(tid,)).fetchone()[0]);db.close()
   before=hashlib.sha256(rollout.read_bytes()).hexdigest()
   native=name=='native-restored'
   args={'action':'native' if native else name,'baseUrl':base+'/'+name+'/v1','key':'fixture-key-'+name[-1],'model':'fixture-'+name+'-model'}
   env={**{k:v for k,v in os.environ.items() if not k.startswith(('CODEX_','OPENAI_','AI_ZERO_TOKEN_'))},'CODEX_HOME':str(codex_home),'AI_ZERO_TOKEN_HOME':str(root/'azt-home')}
   completed=subprocess.run(['bun',str(worker),json.dumps(args)],cwd=repo,env=env,capture_output=True,text=True,timeout=60)
   if completed.returncode:raise RuntimeError(completed.stderr)
   assert hashlib.sha256(rollout.read_bytes()).hexdigest()==before,'AZT edited JSONL'
   assert hashlib.sha256((codex_home/'auth.json').read_bytes()).hexdigest()==auth_hash,'AZT replaced native auth'
   if native:
    config=(codex_home/'config.toml').read_text()
    assert 'model_provider = "openai"' in config and 'experimental_bearer_token' not in config and 'openai_base_url' not in config
    # Redirect the native transport only in this offline fixture, after validating restoration.
    (codex_home/'config.toml').write_text('openai_base_url = '+json.dumps(base+'/native/v1')+'\n'+config)
  c=Client()
  if tid is None:
   reply=c.rpc('thread/start',{'cwd':str(root),'approvalPolicy':'never','sandbox':'read-only'});tid=reply['thread']['id']
  else:reply=c.rpc('thread/resume',{'threadId':tid})
  n=len(requests);c.turn(tid,'marker-first' if name=='native-start' else 'Continue.')
  actual=[r for r in requests[n:] if r['inputCount']>0]
  expected_provider='openai' if name.startswith('native') else 'azt_active'
  assert reply['modelProvider']==expected_provider
  assert actual and all(r['hasEarlierMarker'] and r['authMatchesTarget'] for r in actual)
  expected_path='/native/v1/responses' if name.startswith('native') else '/'+name+'/v1/responses'
  assert all(r['path']==expected_path for r in actual)
  if name.startswith('third'):assert all(r['transport']=='http' and r['reasoningEffort'] is None and not r['officialAccountHeaderPresent'] and r['model']=='fixture-'+name+'-model' for r in actual)
  record={'phase':name,'threadId':tid,'provider':reply['modelProvider'],'model':reply['model'],'requests':actual}
  records.append(record);print(json.dumps(record),flush=True)
finally:
 if c:c.close()
 server.shutdown()
 (root/'report.json').write_text(json.dumps({'scope':'actual AZT switch implementation; actual Codex; synthetic credentials and local endpoints; native transport redirected by fixture','records':records},indent=2))
 print('REPORT:',root/'report.json')
