#!/usr/bin/env ruby
require 'yaml'
require 'json'

# Read only rendered application manifests. Never dump Secret contents on errors.
docs = YAML.load_stream(STDIN.read).compact
errors = []
expected = {'web-customer'=>80, 'api-gateway'=>3000, 'identity-service'=>3001,
            'menu-service'=>3003, 'inventory-service'=>3004, 'order-service'=>3005,
            'news-service'=>3006, 'ai-service'=>8000}
public_ports = {'web-customer'=>5175, 'api-gateway'=>3000, 'order-service'=>3005}
deployments = docs.select { |o| o['kind'] == 'Deployment' }.map { |o| [o['metadata']['name'], o] }.to_h
services = docs.select { |o| o['kind'] == 'Service' }
fail_check = ->(ok, message) { errors << message unless ok }
identities = docs.map { |o| [o['kind'], o.dig('metadata','namespace'), o.dig('metadata','name')] }
fail_check.call(identities.uniq.size == identities.size, 'Duplicate resource identities')
docs.each do |o|
  name = o.dig('metadata','name')
  fail_check.call(o['kind']=='Namespace' ? name=='avengers-coffee' : o.dig('metadata','namespace')=='avengers-coffee', "#{o['kind']}/#{name}: namespace")
  labels = o.dig('metadata','labels') || {}
  fail_check.call(labels['app.kubernetes.io/part-of']=='avengers-coffee' && labels['app.kubernetes.io/name'] && labels['app.kubernetes.io/component'], "#{o['kind']}/#{name}: labels")
end
fail_check.call(deployments.keys.sort==expected.keys.sort, 'Expected exactly eight application Deployments')
fail_check.call(services.map { |o| o['metadata']['name'] }.sort==expected.keys.sort, 'Expected exactly eight Services')
services.each do |s|
  name = s['metadata']['name']; ports = s.dig('spec','ports') || []
  fail_check.call(ports.size==1, "Service/#{name}: expected exactly one port")
  fail_check.call(ports.map { |p| p['name'] }.uniq.size==ports.size, "Service/#{name}: duplicate port name")
  fail_check.call(ports.map { |p| [p['port'],p.fetch('protocol','TCP')] }.uniq.size==ports.size, "Service/#{name}: duplicate port/protocol")
  selector = s.dig('spec','selector') || {}; d = deployments[name]
  labels = d && d.dig('spec','template','metadata','labels') || {}
  fail_check.call(!selector.empty? && selector.all? { |k,v| labels[k]==v }, "Service/#{name}: selector does not match its Deployment")
  ports.each do |p|
    fail_check.call(p['name']=='http' && p['port']==(public_ports[name] || expected[name]) && p.fetch('protocol','TCP')=='TCP', "Service/#{name}: incorrect public/internal port")
    cp = d && d.dig('spec','template','spec','containers') || []
    cp = cp.flat_map { |c| c['ports'] || [] }
    fail_check.call(p['targetPort']=='http' && cp.any? { |port| port['name']=='http' && port['containerPort']==expected[name] }, "Service/#{name}: targetPort does not resolve")
  end
  fail_check.call(s.dig('spec','type')==(public_ports.key?(name) ? 'LoadBalancer' : 'ClusterIP'), "Service/#{name}: incorrect exposure")
  fail_check.call(s.dig('spec','sessionAffinity')=='ClientIP', 'Order polling affinity missing') if name=='order-service'
end
deployments.each do |name,d|
  selector = d.dig('spec','selector','matchLabels') || {}; labels = d.dig('spec','template','metadata','labels') || {}
  fail_check.call(!selector.empty? && selector.all? { |k,v| labels[k]==v }, "Deployment/#{name}: selector")
  fail_check.call(d.dig('spec','strategy','rollingUpdate')=={'maxSurge'=>1,'maxUnavailable'=>0}, "Deployment/#{name}: rolling strategy")
  containers = d.dig('spec','template','spec','containers') || []
  volumes = d.dig('spec','template','spec','volumes') || []
  fail_check.call(volumes.none? { |v| v.key?('hostPath') }, "Deployment/#{name}: demo must not depend on node hostPath")
  if %w[menu-service news-service].include?(name)
    init = d.dig('spec','template','spec','initContainers') || []
    fail_check.call(init.size==1 && init[0]['image'].match?(%r{\Aavengers/customer-media:k8s-local(?:-[a-f0-9]{12})?\z}) &&
                    volumes.any? { |v| v['name']=='uploads' && v.key?('emptyDir') }, "Deployment/#{name}: public media snapshot")
    fail_check.call(containers[0].fetch('volumeMounts',[]).any? { |v| v['name']=='uploads' && v['readOnly']==true }, "Deployment/#{name}: read-only application media")
  end
  fail_check.call(containers.size==1, "Deployment/#{name}: expected one application container")
  containers.each do |c|
    fail_check.call(c['image'].match?(%r{\Aavengers/#{name}:k8s-local(?:-[a-f0-9]{12})?\z}) && c['imagePullPolicy']=='IfNotPresent', "Deployment/#{name}: local image policy")
    %w[requests limits].each do |kind|
      fail_check.call(%w[cpu memory].all? { |key| c.dig('resources',kind,key) }, "Deployment/#{name}: resources #{kind}")
    end
    {'startupProbe'=>'/health/live','livenessProbe'=>'/health/live','readinessProbe'=>'/health/ready'}.each do |key,path|
      fail_check.call(c.dig(key,'httpGet','path')==path && c.dig(key,'httpGet','port')=='http', "Deployment/#{name}: #{key}")
    end
    if name!='web-customer'
      refs = c.fetch('envFrom',[])
      fail_check.call(refs.any? { |r| r.dig('configMapRef','name')=='avengers-common' } &&
                      refs.any? { |r| r.dig('configMapRef','name')=="#{name}-config" } &&
                      refs.any? { |r| r.dig('secretRef','name')=="#{name}-secrets" }, "Deployment/#{name}: configuration references")
    end
  end
  fail_check.call(d.dig('spec','replicas')==1, "Deployment/#{name}: must stay at one replica") if %w[order-service ai-service].include?(name)
end
common = docs.find { |o| o['kind']=='ConfigMap' && o.dig('metadata','name')=='avengers-common' }
fail_check.call(common && common.dig('data','K8S_DEMO_READ_ONLY')=='true', 'Demo startup write guard missing')
expected.each do |name,port|
  next if %w[web-customer api-gateway].include?(name)
  key = name.sub('-service','').upcase+'_SERVICE_URL'
  fail_check.call(common && common.dig('data',key)=="http://#{name}:#{port}", "ConfigMap: internal DNS #{key}")
end
hpas = docs.select { |o| o['kind']=='HorizontalPodAutoscaler' }
fail_check.call(hpas.map { |o| o['metadata']['name'] }.sort==%w[api-gateway identity-service menu-service], 'Only Gateway/Identity/Menu may autoscale')
hpas.each do |h|
  name = h['metadata']['name']; min,max = {'api-gateway'=>[2,4],'menu-service'=>[1,4],'identity-service'=>[1,3]}[name]
  fail_check.call(h['apiVersion']=='autoscaling/v2' && h.dig('spec','scaleTargetRef','name')==name &&
                  h.dig('spec','minReplicas')==min && h.dig('spec','maxReplicas')==max &&
                  h.dig('spec','metrics',0,'resource','target','averageUtilization')==60, "HPA/#{name}: target/range")
end
pdb = docs.find { |o| o['kind']=='PodDisruptionBudget' && o.dig('metadata','name')=='api-gateway' }
fail_check.call(pdb && pdb.dig('spec','minAvailable')==1 && pdb.dig('spec','selector','matchLabels','app.kubernetes.io/name')=='api-gateway', 'Gateway PDB')
if errors.empty?
  puts "PASS rendered overlay: #{docs.size} resources, eight Services with unique/resolved ports, selectors, config refs, probes/resources, DNS, HPA/PDB"
  services.select { |s| public_ports.key?(s['metadata']['name']) }.each { |s| puts JSON.generate(s) }
else
  warn errors.join("\n"); exit 1
end
