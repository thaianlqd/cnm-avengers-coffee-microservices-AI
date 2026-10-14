#!/usr/bin/env ruby
require 'yaml'
objects=YAML.load_stream(STDIN.read).compact
errors=[]
scope=%w[api-gateway identity-service menu-service news-service]
%w[Deployment Service].each do |kind|
 names=objects.select{|o|o['kind']==kind}.map{|o|o.dig('metadata','name')}.sort
 errors << "Unexpected #{kind} scope" unless names==scope.sort
end
objects.select{|o|o['kind']=='Service'}.each do |svc|
 name=svc.dig('metadata','name');type=svc.dig('spec','type')||'ClusterIP'
 errors << "Unsafe exposure: #{name}" unless type==(name=='api-gateway' ? 'NodePort' : 'ClusterIP')
 errors << 'Incorrect private NodePort' if name=='api-gateway' && svc.dig('spec','ports',0,'nodePort')!=30300
end
common=objects.find{|o|o['kind']=='ConfigMap' && o.dig('metadata','name')=='avengers-common'}
errors << 'existing DB intent required' unless common.dig('data','K8S_DB_MODE')=='existing'
errors << 'read-only startup mode required' unless common.dig('data','K8S_DEMO_READ_ONLY')=='true'
errors << 'cache TTL changed without experiment' unless common.dig('data','PUBLIC_BROWSE_CACHE_TTL_MS')=='5000'
expected={'api-gateway'=>[2,4],'identity-service'=>[1,3],'menu-service'=>[1,4]}
objects.select{|o|o['kind']=='HorizontalPodAutoscaler'}.each do |h|
 errors << 'Unexpected HPA baseline' unless expected[h.dig('metadata','name')]==[h.dig('spec','minReplicas'),h.dig('spec','maxReplicas')]
end
objects.select{|o|o['kind']=='Deployment'}.each do |d|
 pod=d.dig('spec','template','spec')
 (pod['containers']+(pod['initContainers']||[])).each do |c|
  errors << 'Image pull policy must preserve private import' unless c['imagePullPolicy']=='IfNotPresent'
  if ARGV.include?('--runtime')
   errors << 'Runtime requires immutable cloud images' unless c['image'].match?(/\Aavengers\/[a-z-]+:3k-aws-[0-9a-f]{12}\z/)
  end
 end
 pod['containers'].each do |c|
  errors << 'Missing requests/limits' unless c.dig('resources','requests','cpu') && c.dig('resources','limits','memory')
  errors << 'Liveness must be process-only' unless c.dig('livenessProbe','httpGet','path')=='/health/live'
 end
end
abort errors.join("\n") unless errors.empty?
puts "PASS AWS capacity overlay: #{objects.size} resources, four browse services, private NodePort, baseline resources/HPA/read-only intent"
