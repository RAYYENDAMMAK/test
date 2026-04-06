sudo docker build -t 5gcore-ui:latest ui/
sudo docker save 5gcore-ui:latest | sudo k3s ctr images import -
sudo k3s kubectl rollout restart deployment/core-ui -n open5gs

